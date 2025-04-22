import {
  UUID,
  State as StateV2,
  HandlerCallback as V2HandlerCallback,
} from '@elizaos/core-plugin-v2';
import { IAgentRuntime as V2IAgentRuntime } from '@elizaos/core-plugin-v2';
import {
  Action,
  ClientInstance,
  Evaluator,
  HandlerCallback,
  ICacheManager,
  IDatabaseAdapter as V1IDatabaseAdapter,
  IDatabaseCacheAdapter,
  IAgentRuntime as V1IAgentRuntime,
  IMemoryManager as V1IMemoryManager,
  IRAGKnowledgeManager,
  Memory as V1Memory,
  ModelProviderName,
  Provider,
  Service as V1Service,
  ServiceType as V1ServiceType,
  State,
  UUID as V1UUID,
} from './types';
import { translateV1StateToV2, translateV2StateToV1 } from './translators/state-translator';
import { formatPosts } from './posts';
import { translateV1MemoryToV2 } from './translators/memory-translator';
import { translateV1ActionToV2 as toV2Action } from './translators/action-translator';
import {
  translateV1ProviderToV2 as toV2Provider,
  translateV2ProviderToV1 as fromV2Provider,
} from './translators/provider-translator';
import { translateV1EvaluatorToV2 as toV2Evaluator } from './translators/evaluator-translator';

// Import the proxies from their new locations
import { createMemoryManagerProxy, addEmbeddingToMemory } from './proxies/memory-manager-proxy';
import { createDbAdapterProxy } from './proxies/db-adapter-proxy';
import { createRagKnowledgeManagerProxy } from './proxies/rag-knowledge-manager-proxy';
import { generateUuidFromString } from './uuid';
import { ServiceAdapterFactory } from './adapters/service-adapter-factory';
import { determineServiceType, ServiceCompatManager } from './adapters/service-adapter';
import { formatMessages, formatActors } from './messages';
import { addHeader } from './context';
import { formatActions, formatActionNames, composeActionExamples } from './actions';
import { formatEvaluators, formatEvaluatorNames, formatEvaluatorExamples } from './evaluators';
import { formatGoalsAsString } from './goals';

/**
 * A compatibility runtime that adapts a V2 runtime to the V1 interface.
 * This allows V1 plugins to run on a V2 runtime.
 *
 * IMPORTANT: All database operations are handled by the databaseAdapter property,
 * which implements the V1 IDatabaseAdapter interface and delegates to V2 runtime methods.
 * This maintains the V1 interface compatibility while ensuring a clean separation of concerns.
 */
export class CompatAgentRuntime implements V1IAgentRuntime {
  // The underlying V2 runtime - accessible to proxy implementations
  public readonly _v2Runtime: V2IAgentRuntime;

  // V1 interface properties
  public readonly agentId: V1UUID;
  public readonly serverUrl: string = 'http://localhost:7998';
  public readonly databaseAdapter: V1IDatabaseAdapter;
  public readonly token: string | null;
  public readonly modelProvider: ModelProviderName;
  public readonly imageModelProvider: ModelProviderName;
  public readonly imageVisionModelProvider: ModelProviderName;
  public readonly character: any; // V1 Character type
  public readonly actions: Action[] = [];
  public readonly evaluators: Evaluator[] = [];
  public readonly providers: Provider[] = [];
  public readonly plugins: any[] = [];
  public readonly services: Map<V1ServiceType, V1Service> = new Map();
  public readonly clients: ClientInstance[] = [];
  public readonly fetch: typeof fetch;

  // V1 memory managers
  public readonly messageManager: V1IMemoryManager;
  public readonly descriptionManager: V1IMemoryManager;
  public readonly documentsManager: V1IMemoryManager;
  public readonly knowledgeManager: V1IMemoryManager;
  public readonly loreManager: V1IMemoryManager;
  public readonly ragKnowledgeManager: IRAGKnowledgeManager;
  public readonly cacheManager: ICacheManager;
  public readonly serviceManager: ServiceCompatManager;

  // Private map to store custom memory managers
  private _memoryManagers?: Map<string, V1IMemoryManager>;

  constructor(
    v2Runtime: V2IAgentRuntime,
    opts: {
      character?: any;
      token?: string;
      serverUrl?: string;
      modelProvider?: ModelProviderName;
      imageModelProvider?: ModelProviderName;
      imageVisionModelProvider?: ModelProviderName;
      cacheManager?: ICacheManager;
    } = {}
  ) {
    this._v2Runtime = v2Runtime;

    // Set properties from options or defaults
    this.agentId = v2Runtime.agentId as V1UUID;
    this.character = opts.character || { name: 'CompatAgent', bio: '', lore: [], plugins: [] };
    this.token = opts.token || null;
    this.serverUrl = opts.serverUrl || this.serverUrl;
    this.modelProvider = opts.modelProvider || ModelProviderName.OPENAI;
    this.imageModelProvider = opts.imageModelProvider || this.modelProvider;
    this.imageVisionModelProvider = opts.imageVisionModelProvider || this.modelProvider;
    this.fetch = fetch;
    this.cacheManager = opts.cacheManager || null;

    // Initialize database adapter
    this.databaseAdapter = this._createDbAdapterProxy();

    // Initialize memory managers
    this.messageManager = this._createManagerProxy('messages');
    this.descriptionManager = this._createManagerProxy('descriptions');
    this.documentsManager = this._createManagerProxy('documents');
    this.knowledgeManager = this._createManagerProxy('fragments');
    this.loreManager = this._createManagerProxy('lore');

    // Initialize knowledge manager
    this.ragKnowledgeManager = this._createRagKnowledgeManagerProxy();

    // Initialize service manager
    this.serviceManager = new ServiceCompatManager(this);
  }

  // Helper methods for creating proxies now using imported functions
  private _createManagerProxy(tableName: string): V1IMemoryManager {
    return createMemoryManagerProxy(this, tableName);
  }

  private _createDbAdapterProxy(): V1IDatabaseAdapter & IDatabaseCacheAdapter {
    return createDbAdapterProxy(this);
  }

  private _createRagKnowledgeManagerProxy(): IRAGKnowledgeManager {
    return createRagKnowledgeManagerProxy(this);
  }

  /**
   * Compose the state of the agent into an object that can be passed or used for response generation.
   * @param message The message to compose the state from.
   * @returns The state of the agent.
   */
  async composeState(
    message: V1Memory,
    additionalKeys: { [key: string]: unknown } = {}
  ): Promise<State> {
    console.log(`[Compat Layer] composeState called for message ${message.id}`);

    // STEP 1: Convert V1 memory to V2 format
    const asV2Memory = translateV1MemoryToV2(message);

    // STEP 2: Check if we've already cached the state for this message
    const cachedStateV2 = await this._v2Runtime.stateCache.get(asV2Memory.id);

    // STEP 3: Get V2 state (either fresh or use cached values as base)
    // Use the existing V2 runtime's provider filtering capabilities
    // If cached, we'll get additional providers as needed
    const v2State = await this._v2Runtime.composeState(
      asV2Memory,
      // Pass filter list to control which providers to call
      // This matches V1 behavior where all providers are called by default
      null,
      // Include any specifically requested providers from additionalKeys
      Array.isArray(additionalKeys) ? additionalKeys : null
    );

    // STEP 4: Convert the V2 state to V1 format
    const v1State = translateV2StateToV1(v2State);

    // STEP 5: Run V1-specific providers that may not have V2 equivalents
    // Process V1 context providers that aren't in V2 yet
    if (this.providers.length > 0) {
      const providerResults = await Promise.all(
        this.providers.map(async (provider) => {
          try {
            // Call the provider's get method with the V1 runtime and state
            return await provider.get(this, message, v1State);
          } catch (error) {
            console.error(
              `[Compat Layer] Error executing V1 provider ${provider.name || 'unknown'}:`,
              error
            );
            return null;
          }
        })
      );

      // Filter valid results and add to state
      const validResults = providerResults.filter(
        (result) =>
          result !== null &&
          result !== undefined &&
          (typeof result === 'string' ? result.trim().length > 0 : true)
      );

      // Format providers results into text
      const providersText = validResults
        .map((result) => (typeof result === 'string' ? result : JSON.stringify(result)))
        .join('\n\n');

      // Add providers to V1 state only if not already present
      if (providersText && providersText.length > 0 && !v1State.providers) {
        v1State.providers = addHeader(
          `# Additional Information About ${v1State.agentName || this.character?.name || 'Agent'} and The World`,
          providersText
        );
      }

      // Merge any values from V1 providers
      for (const result of validResults) {
        if (result && result.values && typeof result.values === 'object') {
          Object.assign(v1State, result.values);
        }
      }
    }

    // STEP 6: Process V1-specific actions and evaluators
    // These might not have V2 equivalents or might need special handling
    if (this.actions.length > 0 || this.evaluators.length > 0) {
      // Process actions
      const actionPromises = this.actions.map(async (action: Action) => {
        try {
          const result = await action.validate(this, message, v1State);
          return result ? action : null;
        } catch (error) {
          console.error(`[Compat Layer] Error validating action ${action.name}:`, error);
          return null;
        }
      });

      // Process evaluators
      const evaluatorPromises = this.evaluators.map(async (evaluator) => {
        try {
          const result = await evaluator.validate(this, message, v1State);
          return result ? evaluator : null;
        } catch (error) {
          console.error(`[Compat Layer] Error validating evaluator ${evaluator.name}:`, error);
          return null;
        }
      });

      // Resolve all promises
      const [resolvedActions, resolvedEvaluators] = await Promise.all([
        Promise.all(actionPromises),
        Promise.all(evaluatorPromises),
      ]);

      // Filter out nulls
      const actionsData = resolvedActions.filter(Boolean) as Action[];
      const evaluatorsData = resolvedEvaluators.filter(Boolean) as Evaluator[];

      // Only update these if we have v1-specific actions/evaluators to add
      if (actionsData.length > 0) {
        // Format and add to state
        v1State.actionsData = [...(v1State.actionsData || []), ...actionsData];

        // Update the actions string representation if not already set
        if (!v1State.actions) {
          v1State.actions = addHeader('# Available Actions', formatActions(v1State.actionsData));
        }

        // Update action names if not already set
        if (!v1State.actionNames) {
          v1State.actionNames =
            'Possible response actions: ' + formatActionNames(v1State.actionsData);
        }

        // Update action examples if not already set
        if (!v1State.actionExamples) {
          v1State.actionExamples = addHeader(
            '# Action Examples',
            composeActionExamples(v1State.actionsData, 10)
          );
        }
      }

      // Add evaluators to state
      // TODO: not sure if this is gonna work.
      if (evaluatorsData.length > 0) {
        v1State.evaluatorsData = [
          ...((v1State.evaluatorsData || []) as Evaluator[]),
          ...evaluatorsData,
        ];

        // Update evaluator formatted strings if not already set
        if (!v1State.evaluators) {
          v1State.evaluators = formatEvaluators(v1State.evaluatorsData as Evaluator[]);
        }

        if (!v1State.evaluatorNames) {
          v1State.evaluatorNames = formatEvaluatorNames(v1State.evaluatorsData as Evaluator[]);
        }

        if (!v1State.evaluatorExamples) {
          v1State.evaluatorExamples = formatEvaluatorExamples(
            v1State.evaluatorsData as Evaluator[]
          );
        }
      }
    }

    // STEP 7: Add any explicitly requested additionalKeys
    // At this point we've merged v2 state and v1-specific providers/actions/evaluators
    if (additionalKeys && typeof additionalKeys === 'object') {
      Object.assign(v1State, additionalKeys);
    }

    return v1State;
  }

  /**
   * Update the state with the latest messages
   * @param state The current state to update
   * @returns The updated state
   */
  async updateRecentMessageState(state: State): Promise<State> {
    console.log(`[Compat Layer] updateRecentMessageState called for room ${state.roomId}`);

    if (!state.roomId) {
      console.warn('[Compat Layer] updateRecentMessageState: No roomId in state');
      return state;
    }

    // Get conversation length setting
    const conversationLength = this.getConversationLength();

    // Fetch the latest messages
    const recentMessagesData = await this.messageManager.getMemories({
      roomId: state.roomId,
      count: conversationLength,
      unique: false,
    });

    // First convert to V2, then update values, then convert back to V1
    const stateV2 = translateV1StateToV2(state);

    // Update the messages data in the V2 state
    stateV2.data.recentMessagesData = recentMessagesData.map((memory: V1Memory) => {
      const newMemory = { ...memory };
      if ('embedding' in newMemory) {
        delete newMemory.embedding;
      }
      return newMemory;
    });

    // Format messages for display
    const formattedMessages = formatMessages({
      messages: stateV2.data.recentMessagesData,
      actors: state.actorsData || [],
    });
    stateV2.values.recentMessages = formattedMessages;

    // Format posts for display
    const formattedPosts = formatPosts({
      messages: stateV2.data.recentMessagesData,
      actors: state.actorsData || [],
    });
    stateV2.values.recentPosts = formattedPosts;

    // Handle attachments with time window logic
    let allAttachments = [];
    if (recentMessagesData && Array.isArray(recentMessagesData)) {
      // Find the last message with an attachment
      const lastMessageWithAttachment = recentMessagesData.find(
        (msg) => msg.content.attachments && msg.content.attachments.length > 0
      );

      if (lastMessageWithAttachment) {
        // Create a time window (1 hour before the last message with attachment)
        const lastMessageTime = lastMessageWithAttachment?.createdAt ?? Date.now();
        const oneHourBeforeLastMessage = lastMessageTime - 60 * 60 * 1000; // 1 hour before last message

        // Get all attachments within the time window
        allAttachments = recentMessagesData
          .filter((msg) => {
            const msgTime = msg.createdAt ?? Date.now();
            return msgTime >= oneHourBeforeLastMessage;
          })
          .flatMap((msg) => msg.content.attachments || []);
      }
    }

    // Format attachments
    const formattedAttachments = allAttachments
      .map(
        (attachment) =>
          `ID: ${attachment.id}
Name: ${attachment.title}
URL: ${attachment.url}
Type: ${attachment.source}
Description: ${attachment.description}
Text: ${attachment.text}`
      )
      .join('\n\n');

    // Add the formatted attachments to the V2 state
    stateV2.values.attachments = formattedAttachments
      ? addHeader('# Attachments', formattedAttachments)
      : '';

    // Convert back to V1 state
    return translateV2StateToV1(stateV2);
  }

  // Memory methods
  async addEmbeddingToMemory(memory: V1Memory): Promise<V1Memory> {
    return addEmbeddingToMemory(memory, this);
  }

  // Database initialization
  private async initializeDatabase(): Promise<void> {
    console.log(`[Compat Layer] Initializing database for agent ${this.agentId}`);

    // By convention, we create a user and room using the agent id.
    // Memories related to it are considered global context for the agent.
    await this.ensureRoomExists(this.agentId);

    // Create the agent's account
    await this.ensureUserExists(
      this.agentId,
      this.character.username || this.character.name,
      this.character.name,
      null,
      'system'
    );

    // Add the agent as a participant in its own room
    await this.ensureParticipantExists(this.agentId, this.agentId);

    console.log(`[Compat Layer] Database initialization complete`);
  }

  // Core methods
  async initialize(): Promise<void> {
    console.log(`[Compat Layer] Initializing compatibility runtime for agent ${this.agentId}`);

    // Register standard service adapters
    ServiceAdapterFactory.registerStandardAdapters(this);

    // Call database initialization
    await this.initializeDatabase();

    // Initialize services
    for (const [serviceType, service] of this.services.entries()) {
      try {
        await service.initialize(this);
        console.log(`[Compat Layer] Service ${serviceType} initialized successfully`);
      } catch (error) {
        console.error(`[Compat Layer] Failed to initialize service ${serviceType}:`, error);
        throw error;
      }
    }

    // Import V2 providers from the V2 runtime if any exist
    if (this._v2Runtime.providers && this._v2Runtime.providers.length > 0) {
      for (const v2Provider of this._v2Runtime.providers) {
        try {
          // Check if we already have an equivalent provider
          const existingProvider = this.providers.find((p) => p.name === v2Provider.name);
          if (!existingProvider) {
            // Convert V2 provider to V1 provider
            const v1Provider = fromV2Provider(v2Provider);
            console.log(`[Compat Layer] Imported V2 provider: ${v1Provider.name}`);
            this.registerContextProvider(v1Provider);
          }
        } catch (error) {
          console.error(`[Compat Layer] Error importing V2 provider ${v2Provider.name}:`, error);
        }
      }
    }

    // Initialize character knowledge if present
    if (this.character && this.character.knowledge && this.character.knowledge.length > 0) {
      console.log(`[Compat Layer] Initializing knowledge for ${this.character.name}`);
    }
    // We don't need character ragknowledge here as it's handled by v2 runtime.
  }

  getConversationLength(): number {
    return this._v2Runtime.getConversationLength();
  }

  getSetting(key: string): string | null {
    return this._v2Runtime.getSetting(key) as string | null;
  }

  async processActions(
    message: V1Memory,
    responses: V1Memory[],
    state?: State,
    callback?: HandlerCallback
  ): Promise<void> {
    console.log(`[Compat Layer] processActions called for message ${message.id}`);

    // Convert V1 message to V2 format
    const messageV2 = translateV1MemoryToV2(message);

    // Convert V1 responses to V2 format
    const responsesV2 = responses.map((response) => translateV1MemoryToV2(response));

    // Convert V1 state to V2 format if provided
    const stateV2 = state ? translateV2StateToV1(state) : undefined;

    // Create a wrapper for the callback if provided
    let callbackV2: V2HandlerCallback | undefined;
    if (callback) {
      callbackV2 = async (responseV2, files?) => {
        // Call the V1 callback with V1 formatted response
        const result = await callback(responseV2, files);
        // Convert resulting memories back to V2 format
        return result.map((memory) => translateV1MemoryToV2(memory));
      };
    }

    // Call the V2 runtime's processActions with translated parameters
    return this._v2Runtime.processActions(messageV2, responsesV2, stateV2, callbackV2);
  }

  async evaluate(
    message: V1Memory,
    state?: State,
    didRespond?: boolean,
    callback?: HandlerCallback
  ): Promise<string[] | null> {
    console.log(`[Compat Layer] evaluate called for message ${message.id}`);

    // Convert V1 message to V2 format
    const messageV2 = translateV1MemoryToV2(message);

    // Convert V1 state to V2 format if provided
    const stateV2 = state ? translateV2StateToV1(state) : undefined;

    // Create a wrapper for the callback if provided
    let callbackV2: V2HandlerCallback | undefined;
    if (callback) {
      callbackV2 = async (responseV2, files?) => {
        // Call the V1 callback with V1 formatted response
        const result = await callback(responseV2, files);
        // Convert resulting memories back to V2 format
        return result.map((memory) => translateV1MemoryToV2(memory));
      };
    }

    // Call the V2 runtime's evaluate method with translated parameters
    const evaluatorResults = await this._v2Runtime.evaluate(
      messageV2,
      stateV2,
      didRespond,
      callbackV2
    );

    // The V2 evaluate method might return an array of evaluator objects or null
    if (Array.isArray(evaluatorResults)) {
      // If this is an array of strings, return it directly
      if (evaluatorResults.length > 0 && typeof evaluatorResults[0] === 'string') {
        return evaluatorResults as string[];
      }

      // Otherwise, return the evaluator names
      return evaluatorResults.map((e) => e.name);
    }

    return null;
  }

  // Ensure the existence of methods that were originally on V1 AgentRuntime
  async ensureRoomExists(roomId?: V1UUID): Promise<void> {
    const roomIdToEnsure = (roomId || generateUuidFromString(Date.now().toString())) as UUID;
    console.log(`[Compat Layer] Ensuring room exists: ${roomIdToEnsure}`);

    try {
      // Check if the room already exists
      const existingRoom = await this.databaseAdapter.getRoom(roomIdToEnsure);

      if (!existingRoom) {
        // Create the room if it doesn't exist
        await this.databaseAdapter.createRoom(roomIdToEnsure);
        console.log(`[Compat Layer] Created room ${roomIdToEnsure}`);
      } else {
        console.log(`[Compat Layer] Room ${roomIdToEnsure} already exists`);
      }
    } catch (error) {
      console.error(`[Compat Layer] Error ensuring room exists (ID: ${roomIdToEnsure}):`, error);

      // If error is due to duplicate key and room was being created in parallel
      if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
        console.warn(`[Compat Layer] Room ${roomIdToEnsure} likely created concurrently.`);
        return; // Don't throw for duplicates
      }

      throw error; // Re-throw other errors
    }
  }

  async ensureUserExists(
    userId: V1UUID,
    userName: string | null,
    name: string | null,
    email?: string | null,
    source?: string | null
  ): Promise<void> {
    console.log(`[Compat Layer] Ensuring user exists: ${userId} (${name || userName})`);

    try {
      const existingAccount = await this.databaseAdapter.getAccountById(userId);

      if (!existingAccount) {
        console.log(`[Compat Layer] User ${userId} not found, creating account`);

        // Create the account using databaseAdapter
        await this.databaseAdapter.createAccount({
          id: userId,
          name: name || 'Unknown',
          username: userName || name || 'Unknown',
          email: email || userId,
          details: {
            v1_source: source,
            v1_compat: true,
          },
          avatarUrl: undefined,
        });

        console.log(`[Compat Layer] V1 Account created for user ${userId}`);
      } else {
        console.log(`[Compat Layer] User ${userId} already exists`);
      }
    } catch (error) {
      console.error(`[Compat Layer] Error in ensureUserExists (User: ${userId}):`, error);

      // Handle duplicate errors during createAccount gracefully
      if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
        console.warn(
          `[Compat Layer] ensureUserExists: Entity ${userId} likely created concurrently. Ignoring duplicate error.`
        );
        return; // Don't throw for duplicates
      }

      throw error; // Re-throw other errors
    }
  }

  async ensureParticipantInRoom(userId: V1UUID, roomId: V1UUID): Promise<void> {
    console.log(`[Compat Layer] Ensuring participant ${userId} is in room ${roomId}`);

    try {
      // Get current participants to check if already present
      const participants = await this.databaseAdapter.getParticipantsForRoom(roomId);

      if (!participants.includes(userId)) {
        // Add participant if not already present
        const success = await this.databaseAdapter.addParticipant(userId, roomId);

        if (success) {
          console.log(`[Compat Layer] Added participant ${userId} to room ${roomId}`);
        } else {
          console.warn(`[Compat Layer] Failed to add participant ${userId} to room ${roomId}`);
        }
      } else {
        console.log(`[Compat Layer] Participant ${userId} already in room ${roomId}`);
      }
    } catch (error) {
      console.error(
        `[Compat Layer] Error ensuring participant in room (User: ${userId}, Room: ${roomId}):`,
        error
      );

      // Handle duplicate errors gracefully, as V1 ensure might not have cared
      if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
        console.warn(
          `[Compat Layer] ensureParticipantInRoom: User ${userId} likely already in room ${roomId}. Ignoring duplicate error.`
        );
        return; // Don't throw for duplicates
      }

      throw error; // Re-throw other errors
    }
  }

  async ensureConnection(
    userId: V1UUID,
    roomId: V1UUID,
    userName?: string,
    userScreenName?: string,
    source?: string
  ): Promise<void> {
    console.log(
      `[Compat Layer] Ensuring connection for User: ${userId}, Room: ${roomId}, Source: ${source}`
    );

    try {
      // First ensure the user exists
      await this.ensureUserExists(
        userId,
        userName || 'Unknown',
        userScreenName || userName || 'Unknown',
        undefined, // No email provided in this context
        source
      );

      // Then ensure the room exists
      await this.ensureRoomExists(roomId);

      // Finally ensure the participant is in the room
      await this.ensureParticipantInRoom(userId, roomId);

      // If this is the agent, also ensure the agent is in the room
      if (userId !== this.agentId) {
        await this.ensureParticipantInRoom(this.agentId, roomId);
      }

      console.log(
        `[Compat Layer] Successfully ensured connection for User: ${userId}, Room: ${roomId}`
      );
    } catch (error) {
      console.error(
        `[Compat Layer] Error ensuring connection (User: ${userId}, Room: ${roomId}):`,
        error
      );
      throw error;
    }
  }

  async ensureParticipantExists(userId: V1UUID, roomId: V1UUID): Promise<void> {
    console.log(
      `[Compat Layer] ensureParticipantExists called for User: ${userId}, Room: ${roomId}`
    );
    // In V1, this was effectively the same as ensureParticipantInRoom
    await this.ensureParticipantInRoom(userId, roomId);
  }

  registerAction(action: Action): void {
    console.log(`[Compat Layer] Registering action: ${action.name}`);

    // Add to V1 actions list
    this.actions.push(action);

    // Convert to V2 action and register with V2 runtime if not already there
    try {
      const v2Action = toV2Action(action);
      const existingV2Action = this._v2Runtime.actions.find((a) => a.name === v2Action.name);

      if (!existingV2Action) {
        this._v2Runtime.registerAction(v2Action);
        console.log(`[Compat Layer] Registered V1 action ${action.name} with V2 runtime`);
      }
    } catch (error) {
      console.error(
        `[Compat Layer] Error registering V1 action ${action.name} with V2 runtime:`,
        error
      );
    }
  }

  registerMemoryManager(manager: V1IMemoryManager): void {
    // Private map to store custom memory managers
    if (!this._memoryManagers) {
      this._memoryManagers = new Map<string, V1IMemoryManager>();
    }

    if (!manager.tableName) {
      throw new Error('Memory manager must have a tableName');
    }

    if (this._memoryManagers.has(manager.tableName)) {
      console.warn(
        `[Compat Layer] Memory manager ${manager.tableName} is already registered. Skipping registration.`
      );
      return;
    }

    // Register the memory manager
    this._memoryManagers.set(manager.tableName, manager);
    console.log(`[Compat Layer] Registered memory manager for table: ${manager.tableName}`);
  }

  getMemoryManager(name: string): V1IMemoryManager | null {
    // Initialize memory managers map if it doesn't exist
    if (!this._memoryManagers) {
      this._memoryManagers = new Map<string, V1IMemoryManager>();
    }

    // First check if we have a custom manager registered
    if (this._memoryManagers.has(name)) {
      return this._memoryManagers.get(name) || null;
    }

    // If not, create a proxy manager for this table
    return this._createManagerProxy(name);
  }

  /**
   * Get a service by type, creating proxies as needed for compatibility
   * @param serviceType The V1 service type to get
   * @returns The service or null if not found
   */
  getService<T extends V1Service>(serviceType: V1ServiceType): T | null {
    console.log(`[Compat Layer] getService called for service type: ${serviceType}`);

    // First check if the service is already registered directly in the services map
    if (this.services.has(serviceType)) {
      return this.services.get(serviceType) as T;
    }

    // If not found, use the ServiceAdapterFactory to get or create an adapter
    return this.serviceManager.getService<T>(serviceType);
  }

  /**
   * Register a service with the compatibility runtime
   * @param service The V1 service to register
   */
  async registerService(service: V1Service): Promise<void> {
    if (!service) {
      console.error(`[Compat Layer] Cannot register null or undefined service`);
      throw new Error('Service cannot be null or undefined');
    }

    try {
      // Try to determine the service type from the service instance
      const serviceType = determineServiceType(service);

      console.log(`[Compat Layer] Registering service: ${serviceType}`);

      if (this.services.has(serviceType)) {
        console.warn(
          `[Compat Layer] Service ${serviceType} is already registered. Skipping registration.`
        );
        return;
      }

      // Initialize the service with this runtime
      if (typeof service.initialize === 'function') {
        await service.initialize(this);
      }

      // Add the service to the services map
      this.services.set(serviceType, service);

      // Register with the ServiceAdapterFactory to handle V1/V2 compatibility
      await ServiceAdapterFactory.registerAdapter(this, service);

      console.log(`[Compat Layer] Service ${serviceType} registered successfully`);
    } catch (error) {
      console.error(`[Compat Layer] Error registering service:`, error);
      throw error;
    }
  }

  /**
   * Register a context provider to provide context for message generation.
   * @param provider The context provider to register.
   */
  private registerContextProvider(provider: Provider): void {
    console.log(`[Compat Layer] Registering context provider: ${provider.name}`);

    // Add to V1 providers list
    this.providers.push(provider);

    // Convert to V2 provider and register with V2 runtime if not already there
    try {
      const v2Provider = toV2Provider(provider);
      const existingV2Provider = this._v2Runtime.providers.find((p) => p.name === v2Provider.name);

      if (!existingV2Provider) {
        this._v2Runtime.registerProvider(v2Provider);
        console.log(`[Compat Layer] Registered V1 provider ${provider.name} with V2 runtime`);
      }
    } catch (error) {
      console.error(
        `[Compat Layer] Error registering V1 provider ${provider.name} with V2 runtime:`,
        error
      );
    }
  }

  /**
   * Register an evaluator with the compatibility runtime
   * @param evaluator The V1 evaluator to register
   */
  registerEvaluator(evaluator: Evaluator): void {
    console.log(`[Compat Layer] Registering evaluator: ${evaluator.name}`);

    // Add to V1 evaluators list
    this.evaluators.push(evaluator);

    // Convert to V2 evaluator and register with V2 runtime if not already there
    try {
      const v2Evaluator = toV2Evaluator(evaluator);
      const existingV2Evaluator = this._v2Runtime.evaluators.find(
        (e) => e.name === v2Evaluator.name
      );

      if (!existingV2Evaluator) {
        this._v2Runtime.registerEvaluator(v2Evaluator);
        console.log(`[Compat Layer] Registered V1 evaluator ${evaluator.name} with V2 runtime`);
      }
    } catch (error) {
      console.error(
        `[Compat Layer] Error registering V1 evaluator ${evaluator.name} with V2 runtime:`,
        error
      );
    }
  }
}

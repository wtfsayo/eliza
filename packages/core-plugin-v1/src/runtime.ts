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
import { UUID } from '@elizaos/core-plugin-v2/src/types';
import { ModelType as V2ModelType } from '@elizaos/core-plugin-v2'; // Import V2 ModelType

// Import the proxies from their new locations
import { createMemoryManagerProxy, addEmbeddingToMemory } from './proxies/memory-manager-proxy';
import { createDbAdapterProxy } from './proxies/db-adapter-proxy';
import { createRagKnowledgeManagerProxy } from './proxies/rag-knowledge-manager-proxy';
import { generateUuidFromString } from './uuid';
import { ServiceAdapterFactory } from './adapters/service-adapter-factory';
import { determineServiceType, ServiceCompatManager } from './adapters/service-adapter';

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

    const { userId, roomId } = message;

    // Get actors from the room
    const actorsData = await this.databaseAdapter.getActorDetails({ roomId });

    // Get recent messages
    const recentMessagesData = await this.messageManager.getMemories({
      roomId,
      count: this.getConversationLength(),
      unique: false,
    });

    // Get goals for the room
    const goalsData = await this.databaseAdapter.getGoals({
      agentId: this.agentId,
      roomId,
      onlyInProgress: false,
      count: 10,
    });

    const senderName = actorsData?.find((actor) => actor.id === userId)?.name || 'Unknown';
    const agentName =
      actorsData?.find((actor) => actor.id === this.agentId)?.name || this.character.name;

    // Simplified state object - would need to be more comprehensive in production
    const state: State = {
      userId,
      agentId: this.agentId,
      agentName,
      senderName,
      roomId,
      actorsData,
      recentMessagesData,
      goalsData,
      ...additionalKeys,
    };

    return state;
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

    // Get latest messages
    const recentMessagesData = await this.messageManager.getMemories({
      roomId: state.roomId,
      count: this.getConversationLength(),
      unique: false,
    });

    // Return updated state with new messages
    return {
      ...state,
      recentMessagesData,
    };
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

    // Initialize character knowledge if present
    if (this.character && this.character.knowledge && this.character.knowledge.length > 0) {
      console.log(`[Compat Layer] Initializing knowledge for ${this.character.name}`);

      try {
        // Check if RAG knowledge is enabled
        const useRagKnowledge = !!this.character.settings?.ragKnowledge;
        console.log(`[Compat Layer] RAG Knowledge enabled: ${useRagKnowledge}`);

        if (useRagKnowledge) {
          // Process RAG knowledge - string content will be processed directly
          const stringKnowledge = this.character.knowledge.filter(
            (item): item is string => typeof item === 'string'
          );

          // Process path knowledge items
          const pathKnowledge = this.character.knowledge.filter(
            (item): item is { path: string; shared?: boolean } =>
              typeof item === 'object' && item !== null && 'path' in item
          );

          // Process directory knowledge items
          const directoryKnowledge = this.character.knowledge.filter(
            (item): item is { directory: string; shared?: boolean } =>
              typeof item === 'object' && item !== null && 'directory' in item
          );

          // Log the counts
          console.log(
            `[Compat Layer] Found ${directoryKnowledge.length} directories, ${pathKnowledge.length} paths, and ${stringKnowledge.length} strings`
          );

          // Process directory knowledge first if any
          if (directoryKnowledge.length > 0) {
            console.log(`[Compat Layer] Processing directory knowledge sources`);
            for (const dir of directoryKnowledge) {
              try {
                // Directory processing in V1 is complex - for compatibility we'll log and skip
                // unless implementing the full directory crawler is necessary
                console.log(
                  `[Compat Layer] Directory processing requested for: ${dir.directory} (shared: ${!!dir.shared})`
                );
                console.log(
                  `[Compat Layer] Directory processing is not fully implemented in compat layer`
                );
                // V1 implementation would crawl the directory for md/txt/pdf files and process them
              } catch (error) {
                console.error(
                  `[Compat Layer] Error processing directory knowledge: ${error.message}`
                );
              }
            }
          }

          // Process path knowledge
          if (pathKnowledge.length > 0) {
            console.log(`[Compat Layer] Processing path knowledge sources`);
            for (const item of pathKnowledge) {
              try {
                console.log(
                  `[Compat Layer] Processing file: ${item.path} (shared: ${!!item.shared})`
                );
                // In V1, this would read the file and process it
                // For compatibility, we'll note that file reading should happen elsewhere
                // and let the content handling plugins deal with it
              } catch (error) {
                console.error(`[Compat Layer] Error processing file knowledge: ${error.message}`);
              }
            }
          }

          // Process string knowledge
          if (stringKnowledge.length > 0) {
            console.log(
              `[Compat Layer] Processing ${stringKnowledge.length} string knowledge items`
            );
            for (const text of stringKnowledge) {
              try {
                const id = this.ragKnowledgeManager.generateScopedId(text.substring(0, 50), false);
                await this.ragKnowledgeManager.createKnowledge({
                  id: id,
                  agentId: this.agentId,
                  content: {
                    text: text,
                    metadata: {
                      type: 'direct',
                    },
                  },
                });
              } catch (error) {
                console.error(`[Compat Layer] Error processing string knowledge: ${error.message}`);
              }
            }
          }

          // Run cleanup for deleted files
          await this.ragKnowledgeManager.cleanupDeletedKnowledgeFiles();
        } else {
          // Non-RAG knowledge processing
          // In V1, this would use knowledge.set for each string
          console.log(`[Compat Layer] Processing non-RAG knowledge`);

          // Filter for just string knowledge
          const stringKnowledge = this.character.knowledge.filter(
            (item): item is string => typeof item === 'string'
          );

          for (const text of stringKnowledge) {
            try {
              // Generate a document ID (V1 would use stringToUuid)
              const id = generateUuidFromString(text.substring(0, 50));

              // Create a V2 document memory (V1 would use this.documentsManager)
              await this._v2Runtime.createMemory(
                {
                  id: id,
                  entityId: this.agentId as any,
                  agentId: this.agentId as any,
                  roomId: this.agentId as any,
                  content: { text },
                  metadata: {
                    type: 'document',
                    timestamp: Date.now(),
                  },
                },
                'documents'
              );
            } catch (error) {
              console.error(`[Compat Layer] Error processing non-RAG knowledge: ${error.message}`);
            }
          }
        }

        console.log(`[Compat Layer] Knowledge initialization complete`);
      } catch (error) {
        console.error(`[Compat Layer] Error during knowledge initialization:`, error);
      }
    }
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
    return this._v2Runtime.processActions(message, responses, state, callback);
  }

  async evaluate(
    message: V1Memory,
    state?: State,
    didRespond?: boolean,
    callback?: HandlerCallback
  ): Promise<string[] | null> {
    return this._v2Runtime.evaluate(message, state, didRespond, callback);
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
    this.actions.push(action);
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
}

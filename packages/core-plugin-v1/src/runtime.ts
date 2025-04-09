/**
 * CompatAgentRuntime - A compatibility layer that adapts a V2 runtime to the V1 interface.
 *
 * REFACTORING PROPOSAL:
 * This file can be split into multiple modules:
 *
 * 1. `proxies/memory-manager-proxy.ts`:
 *    - Export _createManagerProxy function and related helpers
 *    - Export addEmbeddingToMemory utility
 *
 * 2. `proxies/db-adapter-proxy.ts`:
 *    - Export _createDbAdapterProxy function
 *
 * 3. `proxies/rag-knowledge-manager-proxy.ts`:
 *    - Export _createRagKnowledgeManagerProxy function
 *    - Export related knowledge management helpers
 *
 * 4. `utils/uuid.ts`:
 *    - Export generateUuidFromString function
 *
 * This would reduce the size of runtime.ts significantly and improve code organization.
 */

import { IAgentRuntime as V2IAgentRuntime } from '@elizaos/core-plugin-v2';
import {
  Action,
  Account as V1Account,
  Actor as V1Actor,
  ClientInstance,
  Evaluator,
  Goal as V1Goal,
  GoalStatus as V1GoalStatus,
  HandlerCallback,
  ICacheManager,
  IDatabaseAdapter as V1IDatabaseAdapter,
  IDatabaseCacheAdapter,
  IAgentRuntime as V1IAgentRuntime,
  IMemoryManager as V1IMemoryManager,
  IRAGKnowledgeManager,
  Memory as V1Memory,
  ModelProviderName,
  ModelClass,
  Participant as V1Participant,
  Provider,
  RAGKnowledgeItem as V1RAGKnowledgeItem,
  Relationship as V1Relationship,
  Service as V1Service,
  ServiceType as V1ServiceType,
  State,
  UUID as V1UUID,
} from './types';
import { translateV2MemoryToV1, translateV1MemoryToV2 } from './translators/memory-translator';
import {
  translateV1GoalToV2Task,
  translateV2TaskToV1Goal,
} from './translators/goal-task-translator';
import { Task, UUID } from '@elizaos/core-plugin-v2/src/types';

// Import the proxies from their new locations
import { createMemoryManagerProxy, addEmbeddingToMemory } from './proxies/memory-manager-proxy';
import { createDbAdapterProxy } from './proxies/db-adapter-proxy';
import { createRagKnowledgeManagerProxy } from './proxies/rag-knowledge-manager-proxy';
import { generateUuidFromString } from './utils/uuid';
import { createServiceProxy } from './proxies/service-proxy';
import {
  generateText,
  generateEmbedding,
  generateImage,
  mapModelClassToModelType,
} from './models/model-compat';

/**
 * A compatibility runtime that adapts a V2 runtime to the V1 interface.
 * This allows V1 plugins to run on a V2 runtime.
 */
export class CompatAgentRuntime implements V1IAgentRuntime {
  // The underlying V2 runtime - accessible to proxy implementations
  private readonly _v2Runtime: V2IAgentRuntime;

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

    // Initialize memory managers
    this.messageManager = this._createManagerProxy('messages');
    this.descriptionManager = this._createManagerProxy('descriptions');
    this.documentsManager = this._createManagerProxy('documents');
    this.knowledgeManager = this._createManagerProxy('fragments');
    this.loreManager = this._createManagerProxy('lore');

    // Initialize knowledge and database managers
    this.ragKnowledgeManager = this._createRagKnowledgeManagerProxy();
    this.databaseAdapter = this._createDbAdapterProxy();
  }

  // Expose V2 runtime to proxy implementations
  getV2Runtime(): V2IAgentRuntime {
    return this._v2Runtime;
  }

  // DATABASE ADAPTER METHODS

  async getAccountById(userId: V1UUID): Promise<V1Account | null> {
    const entity = await this._v2Runtime.getEntityById(userId as any);
    if (!entity) return null;

    return {
      id: entity.id as V1UUID,
      name: entity.names[0] || 'Unknown',
      username: entity.names[1] || entity.names[0] || 'unknown',
      details: entity.metadata || {},
      email: entity.metadata?.email || userId,
      avatarUrl: entity.metadata?.avatarUrl,
    };
  }

  async createAccount(account: V1Account): Promise<boolean> {
    const entity = {
      id: account.id,
      names: [account.name, account.username].filter(Boolean),
      metadata: {
        ...account.details,
        email: account.email,
        avatarUrl: account.avatarUrl,
      },
      agentId: this.agentId,
    };

    return await this._v2Runtime.createEntity(entity);
  }

  // Memory methods
  async getMemories(params: {
    roomId: V1UUID;
    count?: number;
    unique?: boolean;
    tableName: string;
    agentId: V1UUID;
    start?: number;
    end?: number;
    entityId?: V1UUID;
  }): Promise<V1Memory[]> {
    // Check if the V1 agentId matches the V2 runtime's agentId
    if (params.agentId !== this._v2Runtime.agentId) {
      console.warn(
        `[Compat Layer] getMemories called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${this._v2Runtime.agentId}. Proceeding with V2's agentId context for DB query.`
      );
    }

    // Prepare V2 parameters (primarily filtering by roomId and tableName)
    const v2Params = {
      roomId: params.roomId,
      count: params.count,
      unique: params.unique,
      tableName: params.tableName,
      start: params.start,
      end: params.end,
      entityId: params.entityId,
      // Don't pass agentId explicitly - let V2 handle agent context if needed
    };

    // Call V2 equivalent
    const v2Memories = await this._v2Runtime.getMemories(v2Params);

    // Translate results back to V1 format
    return v2Memories.map((memory) => translateV2MemoryToV1(memory));
  }

  async getMemoryById(id: V1UUID): Promise<V1Memory | null> {
    // Call V2 equivalent
    const v2Memory = await this._v2Runtime.getMemoryById(id);

    // Return null if memory not found
    if (!v2Memory) return null;

    // Translate result back to V1 format
    return translateV2MemoryToV1(v2Memory);
  }

  async getMemoriesByIds(ids: V1UUID[], tableName?: string): Promise<V1Memory[]> {
    // Call V2 equivalent
    const v2Memories = await this._v2Runtime.getMemoriesByIds(ids, tableName);

    // Translate results back to V1 format
    return v2Memories.map((memory) => translateV2MemoryToV1(memory));
  }

  async getMemoriesByRoomIds(params: {
    tableName: string;
    agentId: V1UUID;
    roomIds: V1UUID[];
    limit?: number;
  }): Promise<V1Memory[]> {
    // Check if the V1 agentId matches the V2 runtime's agentId
    if (params.agentId !== this._v2Runtime.agentId) {
      console.warn(
        `[Compat Layer] getMemoriesByRoomIds called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${this._v2Runtime.agentId}.`
      );
    }

    // Prepare V2 parameters
    const v2Params = {
      tableName: params.tableName,
      roomIds: params.roomIds,
      limit: params.limit,
    };

    // Call V2 equivalent
    const v2Memories = await this._v2Runtime.getMemoriesByRoomIds(v2Params);

    // Translate results back to V1 format
    return v2Memories.map((memory) => translateV2MemoryToV1(memory));
  }

  async getCachedEmbeddings(params: {
    query_table_name: string;
    query_threshold: number;
    query_input: string;
    query_field_name: string;
    query_field_sub_name: string;
    query_match_count: number;
  }): Promise<{ embedding: number[]; levenshtein_score: number }[]> {
    // V2 interface accepts same parameters, pass through directly
    return await this._v2Runtime.getCachedEmbeddings(params);
  }

  async log(params: {
    body: { [key: string]: unknown };
    userId: V1UUID;
    roomId: V1UUID;
    type: string;
  }): Promise<void> {
    // Map V1 userId to V2 entityId
    const v2Params = {
      body: params.body,
      entityId: params.userId as any, // V1 userId -> V2 entityId
      roomId: params.roomId as any,
      type: params.type,
    };

    try {
      await this._v2Runtime.log(v2Params);
    } catch (error) {
      console.error(`[Compat Layer] Error in log:`, error);
      throw error;
    }
  }

  async getActorDetails(params: { roomId: V1UUID }): Promise<V1Actor[]> {
    try {
      // Get entities for room
      const entities = await this._v2Runtime.getEntitiesForRoom(params.roomId as any, true);

      // Map V2 entities to V1 actors
      return entities.map((entity) => ({
        id: entity.id as V1UUID,
        name: entity.names[0] || 'Unknown',
        username: entity.names[1] || entity.names[0] || 'unknown',
        details: {
          tagline: entity.metadata?.tagline || '',
          summary: entity.metadata?.summary || '',
          quote: entity.metadata?.quote || '',
          ...entity.metadata,
        },
      }));
    } catch (error) {
      console.error(`[Compat Layer] Error in getActorDetails:`, error);
      return []; // Return empty array on error
    }
  }

  async searchMemories(params: {
    tableName: string;
    agentId: V1UUID;
    roomId: V1UUID;
    embedding: number[];
    match_threshold: number;
    match_count: number;
    unique: boolean;
  }): Promise<V1Memory[]> {
    // Check if the V1 agentId matches the V2 runtime's agentId
    if (params.agentId !== this._v2Runtime.agentId) {
      console.warn(
        `[Compat Layer] searchMemories called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${this._v2Runtime.agentId}.`
      );
    }

    // Prepare V2 parameters
    const v2Params = {
      embedding: params.embedding,
      match_threshold: params.match_threshold,
      count: params.match_count,
      roomId: params.roomId,
      unique: params.unique,
      tableName: params.tableName,
    };

    // Call V2 equivalent
    const v2Memories = await this._v2Runtime.searchMemories(v2Params);

    // Translate results back to V1 format
    return v2Memories.map((memory) => translateV2MemoryToV1(memory));
  }

  async updateGoalStatus(params: { goalId: V1UUID; status: V1GoalStatus }): Promise<void> {
    try {
      console.log(`[Compat Layer] Updating goal status for ${params.goalId} to ${params.status}`);

      // Get the current task from V2
      const existingTask = await this._v2Runtime.getTask(params.goalId as UUID);
      if (!existingTask?.metadata?.v1_compat) {
        console.warn(
          `[Compat Layer] updateGoalStatus: Task ${params.goalId} not found or not a V1 compatible task.`
        );
        return;
      }

      // Prepare partial update with just the status change
      const updatedMetadata = {
        ...existingTask.metadata, // Keep existing metadata
        v1_status: params.status, // Update only the status
      };

      // Call V2 updateTask with partial update
      await this._v2Runtime.updateTask(params.goalId as UUID, { metadata: updatedMetadata });
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 updateTask for V1 updateGoalStatus (ID: ${params.goalId}):`,
        error
      );
      throw error;
    }
  }

  async searchMemoriesByEmbedding(
    embedding: number[],
    params: {
      match_threshold?: number;
      count?: number;
      roomId?: V1UUID;
      agentId?: V1UUID;
      unique?: boolean;
      tableName: string;
    }
  ): Promise<V1Memory[]> {
    // Check if the V1 agentId matches the V2 runtime's agentId
    if (params.agentId && params.agentId !== this._v2Runtime.agentId) {
      console.warn(
        `[Compat Layer] searchMemoriesByEmbedding called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${this._v2Runtime.agentId}.`
      );
    }

    // Prepare V2 parameters
    const v2Params = {
      embedding: embedding,
      match_threshold: params.match_threshold,
      count: params.count,
      roomId: params.roomId,
      unique: params.unique,
      tableName: params.tableName,
      // No need to pass agentId, V2 handles it through runtime context
    };

    // Call V2 equivalent - actually reuse searchMemories
    const v2Memories = await this._v2Runtime.searchMemories(v2Params);

    // Translate results back to V1 format
    return v2Memories.map((memory) => translateV2MemoryToV1(memory));
  }

  async createMemory(memory: V1Memory, tableName: string, unique?: boolean): Promise<void> {
    // Convert V1 memory to V2 format
    const v2Memory = translateV1MemoryToV2(memory);

    // Call V2 equivalent
    await this._v2Runtime.createMemory(v2Memory, tableName, unique);
  }

  async removeMemory(memoryId: V1UUID, tableName: string): Promise<void> {
    // V2 uses deleteMemory instead of removeMemory and doesn't require tableName
    await this._v2Runtime.deleteMemory(memoryId);
  }

  async removeAllMemories(roomId: V1UUID, tableName: string): Promise<void> {
    // Call V2 equivalent which has the same signature
    await this._v2Runtime.deleteAllMemories(roomId, tableName);
  }

  async countMemories(roomId: V1UUID, unique?: boolean, tableName?: string): Promise<number> {
    // Call V2 equivalent which has the same signature
    return await this._v2Runtime.countMemories(roomId, unique, tableName);
  }

  // Goal methods
  async getGoals(params: {
    agentId: V1UUID;
    roomId: V1UUID;
    userId?: V1UUID | null;
    onlyInProgress?: boolean;
    count?: number;
  }): Promise<V1Goal[]> {
    try {
      // Check agentId
      if (params.agentId !== this.agentId) {
        console.warn(
          `[Compat Layer] getGoals called with mismatched agentId. Using runtime agentId: ${this.agentId}`
        );
      }

      // Fetch potentially relevant tasks from V2
      // Request a higher limit than needed to allow for filtering
      const v2Limit = params.count ? params.count * 2 : 20;
      const v2Tasks = await this._v2Runtime.getTasks({
        roomId: params.roomId as UUID,
        tags: ['v1_goal_compat'], // Filter by compatibility tag
        // In V2, we don't need to specify agentId since it's implicit
      });

      console.log(`[Compat Layer] Found ${v2Tasks.length} potential V1-compatible tasks`);

      // Filter and translate V2 Tasks to V1 Goals using the translator function
      const v1Goals = v2Tasks
        .map((task) => translateV2TaskToV1Goal(task)) // Translate first
        .filter((goal): goal is V1Goal => {
          if (!goal) return false; // Skip if translation failed

          // Apply V1 filters
          if (params.userId && goal.userId !== params.userId) {
            return false; // Filter by V1 userId
          }
          if (params.onlyInProgress && goal.status !== V1GoalStatus.IN_PROGRESS) {
            return false; // Filter by V1 status
          }
          return true;
        })
        .slice(0, params.count); // Apply V1 limit

      console.log(`[Compat Layer] Returning ${v1Goals.length} V1 goals after filtering`);
      return v1Goals;
    } catch (error) {
      console.error(`[Compat Layer] Error in getGoals:`, error);
      throw error;
    }
  }

  async updateGoal(goal: V1Goal): Promise<void> {
    if (!goal.id) {
      throw new Error('[Compat Layer] updateGoal requires goal object with an ID.');
    }

    try {
      console.log(`[Compat Layer] Updating goal "${goal.name}" (${goal.id})`);

      // Get the current task from V2
      const existingTask = await this._v2Runtime.getTask(goal.id as UUID);
      if (!existingTask?.metadata?.v1_compat) {
        console.warn(
          `[Compat Layer] updateGoal: Task ${goal.id} not found or not a V1 compatible task. Cannot update.`
        );
        return;
      }

      // Prepare partial update for V2 task metadata
      const updatedMetadata = {
        ...existingTask.metadata, // Keep existing metadata
        v1_userId: goal.userId,
        v1_status: goal.status,
        v1_objectives: goal.objectives,
      };

      // Update name/description if changed
      const taskUpdate: Partial<Task> = {
        metadata: updatedMetadata,
      };

      if (goal.name !== existingTask.name) {
        taskUpdate.name = goal.name;
      }

      // Call V2 updateTask with partial update
      await this._v2Runtime.updateTask(goal.id as UUID, taskUpdate);
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 updateTask for V1 updateGoal (ID: ${goal.id}):`,
        error
      );
      throw error;
    }
  }

  async createGoal(goal: V1Goal): Promise<void> {
    try {
      console.log(`[Compat Layer] Creating goal "${goal.name}" (${goal.id})`);

      // Translate V1 Goal to V2 Task using the translator function
      const task = translateV1GoalToV2Task(goal);

      // Create the task in V2
      await this._v2Runtime.createTask(task);

      // V1 returns void
    } catch (error) {
      console.error(`[Compat Layer] Error calling V2 createTask for V1 createGoal:`, error);
      throw error;
    }
  }

  async removeGoal(goalId: V1UUID): Promise<void> {
    try {
      console.log(`[Compat Layer] Removing goal ${goalId}`);

      // V2 deleteTask works directly with the ID
      await this._v2Runtime.deleteTask(goalId as UUID);
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 deleteTask for V1 removeGoal (ID: ${goalId}):`,
        error
      );

      // Don't throw if task doesn't exist - V1 might have handled this silently
      if (!error.message?.includes('not found')) {
        throw error;
      }
    }
  }

  async removeAllGoals(roomId: V1UUID): Promise<void> {
    try {
      console.log(`[Compat Layer] Removing all goals for room ${roomId}`);

      // Find all V1-compatible tasks in the room
      const v1CompatTasks = await this._v2Runtime.getTasks({
        roomId: roomId as UUID,
        tags: ['v1_goal_compat'],
      });

      console.log(`[Compat Layer] Found ${v1CompatTasks.length} V1-compatible goals to remove`);

      // Delete each found task
      if (v1CompatTasks.length > 0) {
        const deletePromises = v1CompatTasks.map((task) => this._v2Runtime.deleteTask(task.id!));

        await Promise.all(deletePromises);
      }
    } catch (error) {
      console.error(
        `[Compat Layer] Error during V1 removeAllGoals simulation (Room: ${roomId}):`,
        error
      );
      throw error;
    }
  }

  // Room methods
  async getRoom(roomId: V1UUID): Promise<V1UUID | null> {
    try {
      const v2Room = await this._v2Runtime.getRoom(roomId as any);
      // V1 expects the ID string back, or null if not found
      return v2Room ? (v2Room.id as V1UUID) : null;
    } catch (error) {
      console.error(`[Compat Layer] Error calling V2 getRoom for roomId ${roomId}:`, error);
      throw error;
    }
  }

  async createRoom(roomId?: V1UUID): Promise<V1UUID> {
    // Determine the ID to use: provided V1 ID or generate a new one
    const idToUse = (roomId || generateUuidFromString(Date.now().toString())) as any;

    // Construct the V2 Room object with necessary defaults
    // TODO: I don't know if this is correct approach.
    // But should be alright let's check this!
    const v2RoomData = {
      id: idToUse,
      agentId: this._v2Runtime.agentId, // Associate with current agent
      source: 'v1_compat_create', // Indicate origin
      type: 'UNKNOWN', // Default type since V1 didn't specify type
      name: `V1 Compat Room ${idToUse.slice(0, 8)}`, // Default name
      metadata: { v1_compat: true },
    };

    try {
      // Call V2 createRoom
      const createdRoomId = await this._v2Runtime.createRoom(v2RoomData);
      // Both V1 and V2 return the UUID string
      return createdRoomId as V1UUID;
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 createRoom for V1 createRoom (ID: ${idToUse}):`,
        error
      );
      // Handle duplicate errors if V1 might have ignored them
      if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
        console.warn(
          `[Compat Layer] createRoom: Room ${idToUse} likely already exists (duplicate key). Returning existing ID.`
        );
        return idToUse as V1UUID; // Return the ID that likely exists
      }
      throw error; // Re-throw other errors
    }
  }

  async removeRoom(roomId: V1UUID): Promise<void> {
    try {
      // Call V2 equivalent with the correct name
      await this._v2Runtime.deleteRoom(roomId as any);
      // V1 returns void
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 deleteRoom for V1 removeRoom (ID: ${roomId}):`,
        error
      );
      // Don't throw if V2 errors on non-existent ID, V1 might expect that
      if (!error.message?.includes('not found')) {
        throw error;
      }
    }
  }

  async getRoomsForParticipant(userId: V1UUID): Promise<V1UUID[]> {
    try {
      // Map V1 userId to V2 entityId parameter
      const roomIds = await this._v2Runtime.getRoomsForParticipant(userId as any);
      // Return type UUID[] is compatible
      return roomIds as V1UUID[];
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 getRoomsForParticipant for userId ${userId}:`,
        error
      );
      throw error;
    }
  }

  async getRoomsForParticipants(userIds: V1UUID[]): Promise<V1UUID[]> {
    try {
      // Signature and types match, delegate directly
      const roomIds = await this._v2Runtime.getRoomsForParticipants(userIds as any[]);
      return roomIds as V1UUID[];
    } catch (error) {
      console.error(`[Compat Layer] Error calling V2 getRoomsForParticipants:`, error);
      throw error;
    }
  }

  // Participant methods
  async addParticipant(userId: V1UUID, roomId: V1UUID): Promise<boolean> {
    try {
      // Map V1 userId to V2 entityId parameter
      const success = await this._v2Runtime.addParticipant(userId as any, roomId as any);
      return success;
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 addParticipant (User: ${userId}, Room: ${roomId}):`,
        error
      );
      // Handle specific errors? V1 might expect false on failure.
      if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
        console.warn(
          `[Compat Layer] addParticipant: User ${userId} likely already in room ${roomId}. Simulating V1 success.`
        );
        return true; // V1 might not have errored if already present
      }
      // Return false for compatibility with V1 expectation of boolean result
      return false;
    }
  }

  async removeParticipant(userId: V1UUID, roomId: V1UUID): Promise<boolean> {
    try {
      // Map V1 userId to V2 entityId parameter
      const success = await this._v2Runtime.removeParticipant(userId as any, roomId as any);
      return success;
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 removeParticipant (User: ${userId}, Room: ${roomId}):`,
        error
      );
      // V1 might expect false on failure or if participant wasn't found
      return false;
    }
  }

  // Helper to translate V2 Entity to V1 Account (similar logic as getAccountById)
  private _translateV2EntityToV1Account(entity: any): V1Account | null {
    if (!entity) return null;
    return {
      id: entity.id as V1UUID,
      name: entity.names?.[0] || 'Unknown',
      username: entity.names?.[1] || entity.names?.[0] || 'unknown',
      details: entity.metadata || {},
      email: entity.metadata?.email || entity.id,
      avatarUrl: entity.metadata?.avatarUrl,
    };
  }

  async getParticipantsForAccount(userId: V1UUID): Promise<V1Participant[]> {
    try {
      // Map V1 userId to V2 entityId parameter and call V2 method
      const v2Participants = await this._v2Runtime.getParticipantsForEntity(userId as any);

      // Translate V2Participant[] -> V1Participant[]
      const v1Participants = v2Participants
        .map((v2Participant) => {
          const v1Account = this._translateV2EntityToV1Account(v2Participant.entity);
          if (!v1Account) {
            console.warn(
              `[Compat Layer] Failed to translate entity for participant ${v2Participant.id}`
            );
            return null; // Skip participant if entity translation fails
          }
          return {
            id: v2Participant.id as V1UUID,
            account: v1Account,
          };
        })
        .filter((p): p is V1Participant => p !== null); // Filter out any nulls from failed translations

      return v1Participants;
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 getParticipantsForEntity for userId ${userId}:`,
        error
      );
      throw error;
    }
  }

  async getParticipantsForRoom(roomId: V1UUID): Promise<V1UUID[]> {
    // Signature and return type (array of UUID strings) match V1 and V2.
    // Direct delegation is sufficient here.
    try {
      return await this._v2Runtime.getParticipantsForRoom(roomId);
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 getParticipantsForRoom for roomId ${roomId}:`,
        error
      );
      throw error;
    }
  }

  async getParticipantUserState(
    roomId: V1UUID,
    userId: V1UUID
  ): Promise<'FOLLOWED' | 'MUTED' | null> {
    try {
      // Map V1 userId to V2 entityId parameter
      const state = await this._v2Runtime.getParticipantUserState(roomId as any, userId as any);
      return state; // Return type is compatible
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 getParticipantUserState (Room: ${roomId}, User: ${userId}):`,
        error
      );
      throw error;
    }
  }

  async setParticipantUserState(
    roomId: V1UUID,
    userId: V1UUID,
    state: 'FOLLOWED' | 'MUTED' | null
  ): Promise<void> {
    try {
      // Map V1 userId to V2 entityId parameter
      await this._v2Runtime.setParticipantUserState(roomId as any, userId as any, state);
      // V1 returns void
    } catch (error) {
      console.error(
        `[Compat Layer] Error calling V2 setParticipantUserState (Room: ${roomId}, User: ${userId}, State: ${state}):`,
        error
      );
      throw error;
    }
  }

  // Relationship methods
  async createRelationship(params: { userA: V1UUID; userB: V1UUID }): Promise<boolean> {
    try {
      // V2 allows tags/metadata, but V1 didn't provide them.
      return await this._v2Runtime.createRelationship({
        sourceEntityId: params.userA as any,
        targetEntityId: params.userB as any,
      });
    } catch (error) {
      console.error(`[Compat Layer] Error calling V2 createRelationship:`, error);
      // Handle duplicate errors if V1 might have ignored them
      if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
        console.warn(
          `[Compat Layer] createRelationship: Relationship likely already exists (duplicate key). Simulating V1 success.`
        );
        return true;
      }
      throw error; // Re-throw other errors
    }
  }

  async getRelationship(params: { userA: V1UUID; userB: V1UUID }): Promise<V1Relationship | null> {
    try {
      // Check A -> B
      let v2Rel = await this._v2Runtime.getRelationship({
        sourceEntityId: params.userA as any,
        targetEntityId: params.userB as any,
      });

      // If not found, check B -> A for V1 compatibility
      if (!v2Rel) {
        v2Rel = await this._v2Runtime.getRelationship({
          sourceEntityId: params.userB as any,
          targetEntityId: params.userA as any,
        });
      }

      // Translate if found
      return v2Rel ? this._translateV2RelationshipToV1(v2Rel) : null;
    } catch (error) {
      console.error(`[Compat Layer] Error calling V2 getRelationship:`, error);
      throw error;
    }
  }

  async getRelationships(params: { userId: V1UUID }): Promise<V1Relationship[]> {
    try {
      // Map V1 userId to V2 entityId
      const v2Rels = await this._v2Runtime.getRelationships({
        entityId: params.userId as any,
        // V1 didn't support tag filtering here
      });

      // Translate results
      return v2Rels.map((rel) => this._translateV2RelationshipToV1(rel));
    } catch (error) {
      console.error(`[Compat Layer] Error calling V2 getRelationships:`, error);
      throw error;
    }
  }

  // Helper for translating V2 relationship objects to V1 format
  private _translateV2RelationshipToV1(v2Rel: any): V1Relationship {
    const DEFAULT_V1_ROOM_ID = '00000000-0000-0000-0000-000000000000' as V1UUID; // Placeholder for missing V1 field
    const DEFAULT_V1_STATUS = 'connected';

    return {
      id: v2Rel.id as V1UUID,
      userA: v2Rel.sourceEntityId as V1UUID,
      userB: v2Rel.targetEntityId as V1UUID,
      userId: v2Rel.agentId as V1UUID, // Best guess mapping V1's ambiguous userId
      roomId: (v2Rel.metadata?.roomId || DEFAULT_V1_ROOM_ID) as V1UUID, // Try to get from metadata or use default
      status: v2Rel.tags?.[0] || DEFAULT_V1_STATUS, // Map first tag to status or use default
      createdAt: v2Rel.createdAt,
    };
  }

  // Knowledge methods - delegate to ragKnowledgeManager
  async getKnowledge(params: {
    id?: V1UUID;
    agentId: V1UUID;
    limit?: number;
    query?: string;
    conversationContext?: string;
  }): Promise<V1RAGKnowledgeItem[]> {
    console.log(`[Compat Layer] getKnowledge for agentId ${params.agentId}`);
    return this.ragKnowledgeManager.getKnowledge(params);
  }

  async searchKnowledge(params: {
    agentId: V1UUID;
    embedding: Float32Array;
    match_threshold: number;
    match_count: number;
    searchText?: string;
  }): Promise<V1RAGKnowledgeItem[]> {
    console.log(`[Compat Layer] searchKnowledge for agentId ${params.agentId}`);
    return this.ragKnowledgeManager.searchKnowledge(params);
  }

  async createKnowledge(knowledge: V1RAGKnowledgeItem): Promise<void> {
    console.log(`[Compat Layer] createKnowledge for item ${knowledge.id}`);
    return this.ragKnowledgeManager.createKnowledge(knowledge);
  }

  async removeKnowledge(id: V1UUID): Promise<void> {
    console.log(`[Compat Layer] removeKnowledge for id ${id}`);
    return this.ragKnowledgeManager.removeKnowledge(id);
  }

  async clearKnowledge(agentId: V1UUID, shared?: boolean): Promise<void> {
    console.log(`[Compat Layer] clearKnowledge for agentId ${agentId}, shared: ${shared}`);

    // Make sure the agent ID matches our runtime
    if (agentId !== this.agentId) {
      console.warn(
        `[Compat Layer] clearKnowledge called with mismatched agentId. Using current runtime agentId: ${this.agentId}`
      );
    }

    return this.ragKnowledgeManager.clearKnowledge(shared);
  }

  // Core methods
  async initialize(): Promise<void> {
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
    throw new Error('processActions not implemented.');
  }

  async evaluate(
    message: V1Memory,
    state?: State,
    didRespond?: boolean,
    callback?: HandlerCallback
  ): Promise<string[] | null> {
    throw new Error('evaluate not implemented.');
  }

  async ensureRoomExists(roomId?: V1UUID): Promise<void> {
    const roomIdToEnsure = (roomId || generateUuidFromString(Date.now().toString())) as UUID;
    console.log(`[Compat Layer] Ensuring room exists: ${roomIdToEnsure}`);

    try {
      // Check if the room already exists
      const existingRoom = await this._v2Runtime.getRoom(roomIdToEnsure);

      if (!existingRoom) {
        // Construct the V2 Room object needed for creation
        const v2RoomData = {
          id: roomIdToEnsure,
          agentId: this._v2Runtime.agentId, // Associate with current agent
          source: 'v1_compat_ensure', // Indicate origin
          type: 'UNKNOWN', // Default type since V1 didn't specify type
          name: `V1 Compat Room ${roomIdToEnsure.slice(0, 8)}`, // Default name
          metadata: { v1_compat: true },
        };

        // Create the room in V2
        await this._v2Runtime.createRoom(v2RoomData);
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
      const existingEntity = await this._v2Runtime.getEntityById(userId as UUID);

      if (!existingEntity) {
        console.log(`[Compat Layer] User ${userId} not found, creating V2 Entity`);

        // Construct V2 Entity from V1 parameters
        const v2EntityData = {
          id: userId as UUID,
          names: [name, userName].filter(Boolean) as string[], // Use provided names
          metadata: {
            // Store V1 fields in metadata
            v1_source: source,
            username: userName, // Store username explicitly if provided
            email: email,
            v1_compat: true,
          },
          agentId: this._v2Runtime.agentId, // Associate with current agent
        };

        await this._v2Runtime.createEntity(v2EntityData);
        console.log(`[Compat Layer] V2 Entity created for user ${userId}`);
      } else {
        console.log(`[Compat Layer] User ${userId} already exists as V2 Entity`);
        // Note: V1 didn't specify updates to existing entities here
      }
    } catch (error) {
      console.error(`[Compat Layer] Error in ensureUserExists (User: ${userId}):`, error);

      // Handle duplicate errors during createEntity gracefully
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
      const participants = await this._v2Runtime.getParticipantsForRoom(roomId as UUID);

      if (!participants.includes(userId as UUID)) {
        // Call V2 addParticipant, mapping userId to entityId
        const success = await this._v2Runtime.addParticipant(userId as UUID, roomId as UUID);

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
    // Check if we have a cached proxy for this service
    const cachedService = this.services.get(serviceType);
    if (cachedService) {
      return cachedService as T;
    }

    try {
      // Create a new proxy service
      const serviceProxy = createServiceProxy(this, serviceType);

      // Cache the proxy for future use
      this.services.set(serviceType, serviceProxy);

      return serviceProxy as T;
    } catch (error) {
      console.error(`[Compat Layer] Error creating service proxy for ${serviceType}:`, error);
      return null;
    }
  }

  /**
   * Register a service with the compatibility runtime
   * @param service The V1 service to register
   */
  async registerService(service: V1Service): Promise<void> {
    const serviceType = service.serviceType;
    console.log(`[Compat Layer] Registering service: ${serviceType}`);

    if (this.services.has(serviceType)) {
      console.warn(`[Compat Layer] Service ${serviceType} already registered. Replacing.`);
    }

    // Store the service in our V1 service map
    this.services.set(serviceType, service);

    // Initialize the service with this runtime
    await service.initialize(this);

    console.log(`[Compat Layer] Service ${serviceType} registered successfully`);
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

  // Add embedding method moved to memory manager proxy but accessible from runtime
  async addEmbeddingToMemory(memory: V1Memory): Promise<V1Memory> {
    return addEmbeddingToMemory(this, memory);
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

  // Add implementations for composeState and updateRecentMessageState

  async composeState(
    message: V1Memory,
    additionalKeys: { [key: string]: unknown } = {}
  ): Promise<State> {
    console.log(`[Compat Layer] composeState called for message ${message.id}`);

    // In the compat layer, we'll implement a simplified version that delegates to V2 methods
    // This is a placeholder implementation - in a real setting, this would need to be more complete

    const { userId, roomId } = message;

    // Get actors from the room
    const actorsData = await this.getActorDetails({ roomId });

    // Get recent messages
    const recentMessagesData = await this.messageManager.getMemories({
      roomId,
      count: this.getConversationLength(),
      unique: false,
    });

    // Get goals for the room
    const goalsData = await this.getGoals({
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

  /**
   * V1 compatible generateText implementation using V2's useModel
   */
  async generateText(params: {
    runtime: V1IAgentRuntime;
    context: string;
    modelClass?: ModelClass;
    temperature?: number;
    maxTokens?: number;
    stop?: string[];
    frequencyPenalty?: number;
    presencePenalty?: number;
  }): Promise<string> {
    return generateText({
      ...params,
      runtime: this,
    });
  }

  /**
   * V1 compatible generateEmbedding implementation using V2's useModel
   */
  async generateEmbedding(params: { runtime: V1IAgentRuntime; input: string }): Promise<number[]> {
    return generateEmbedding({
      ...params,
      runtime: this,
    });
  }

  /**
   * V1 compatible generateImage implementation using V2's useModel
   */
  async generateImage(params: {
    runtime: V1IAgentRuntime;
    prompt: string;
    count?: number;
    size?: string;
  }): Promise<Array<{ url: string }>> {
    return generateImage({
      ...params,
      runtime: this,
    });
  }
}

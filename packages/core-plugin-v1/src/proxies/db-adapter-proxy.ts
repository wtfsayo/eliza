import {
  IDatabaseAdapter as V1IDatabaseAdapter,
  IDatabaseCacheAdapter,
  UUID as V1UUID,
  Account as V1Account,
  Actor as V1Actor,
  Memory as V1Memory,
  Goal as V1Goal,
  GoalStatus as V1GoalStatus,
  Relationship as V1Relationship,
  Participant as V1Participant,
  RAGKnowledgeItem as V1RAGKnowledgeItem,
} from '../types';
import type { CompatAgentRuntime } from '../runtime';
import { UUID } from '@elizaos/core-plugin-v2';
import { translateV2MemoryToV1, translateV1MemoryToV2 } from '../translators/memory-translator';
import {
  translateV1GoalToV2Task,
  translateV2TaskToV1Goal,
} from '../translators/goal-task-translator';
import { generateUuidFromString } from '../uuid';

/**
 * Creates a proxy object that implements the V1 IDatabaseAdapter & IDatabaseCacheAdapter interfaces
 * and delegates calls to the V2 runtime.
 *
 * This proxy is responsible for:
 * 1. Taking V1-format parameters from client code
 * 2. Translating parameters to V2 format when necessary
 * 3. Calling the appropriate V2 runtime methods
 * 4. Translating the V2 response back to V1 format
 * 5. Handling any error cases specific to V1 compatibility
 *
 * By centralizing all database translation logic here, the CompatAgentRuntime can maintain
 * a clean separation of concerns and accurately simulate the V1 runtime interface.
 */
export function createDbAdapterProxy(
  runtime: CompatAgentRuntime
): V1IDatabaseAdapter & IDatabaseCacheAdapter {
  // This proxy implements all database methods directly, calling V2 runtime methods
  const proxy = {
    db: runtime._v2Runtime.db,
    init: () => runtime.initialize(),
    close: () => Promise.resolve(),

    // Account methods
    getAccountById: async (userId: V1UUID): Promise<V1Account | null> => {
      const entity = await runtime._v2Runtime.getEntityById(userId as any);
      if (!entity) return null;

      return {
        id: entity.id as V1UUID,
        name: entity.names[0] || 'Unknown',
        username: entity.names[1] || entity.names[0] || 'unknown',
        details: entity.metadata || {},
        email: entity.metadata?.email || userId,
        avatarUrl: entity.metadata?.avatarUrl,
      };
    },

    createAccount: async (account: V1Account): Promise<boolean> => {
      const entity = {
        id: account.id,
        names: [account.name, account.username].filter(Boolean),
        metadata: {
          ...account.details,
          email: account.email,
          avatarUrl: account.avatarUrl,
        },
        agentId: runtime.agentId,
      };

      return await runtime._v2Runtime.createEntity(entity);
    },

    // Memory methods
    getMemories: async (params: {
      roomId: V1UUID;
      count?: number;
      unique?: boolean;
      tableName: string;
      agentId: V1UUID;
      start?: number;
      end?: number;
      entityId?: V1UUID;
    }): Promise<V1Memory[]> => {
      // Check if the V1 agentId matches the V2 runtime's agentId
      if (params.agentId !== runtime._v2Runtime.agentId) {
        console.warn(
          `[DB Proxy] getMemories called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${runtime._v2Runtime.agentId}. Proceeding with V2's agentId context for DB query.`
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
      const v2Memories = await runtime._v2Runtime.getMemories(v2Params);

      // Translate results back to V1 format
      return v2Memories.map((memory) => translateV2MemoryToV1(memory));
    },

    getMemoryById: async (id: V1UUID): Promise<V1Memory | null> => {
      // Call V2 equivalent
      const v2Memory = await runtime._v2Runtime.getMemoryById(id);

      // Return null if memory not found
      if (!v2Memory) return null;

      // Translate result back to V1 format
      return translateV2MemoryToV1(v2Memory);
    },

    getMemoriesByIds: async (ids: V1UUID[], tableName?: string): Promise<V1Memory[]> => {
      // Call V2 equivalent
      const v2Memories = await runtime._v2Runtime.getMemoriesByIds(ids, tableName);

      // Translate results back to V1 format
      return v2Memories.map((memory) => translateV2MemoryToV1(memory));
    },

    getMemoriesByRoomIds: async (params: {
      tableName: string;
      agentId: V1UUID;
      roomIds: V1UUID[];
      limit?: number;
    }): Promise<V1Memory[]> => {
      // Check if the V1 agentId matches the V2 runtime's agentId
      if (params.agentId !== runtime._v2Runtime.agentId) {
        console.warn(
          `[DB Proxy] getMemoriesByRoomIds called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${runtime._v2Runtime.agentId}.`
        );
      }

      // Prepare V2 parameters
      const v2Params = {
        tableName: params.tableName,
        roomIds: params.roomIds,
        limit: params.limit,
      };

      // Call V2 equivalent
      const v2Memories = await runtime._v2Runtime.getMemoriesByRoomIds(v2Params);

      // Translate results back to V1 format
      return v2Memories.map((memory) => translateV2MemoryToV1(memory));
    },

    getCachedEmbeddings: async (params: {
      query_table_name: string;
      query_threshold: number;
      query_input: string;
      query_field_name: string;
      query_field_sub_name: string;
      query_match_count: number;
    }): Promise<{ embedding: number[]; levenshtein_score: number }[]> => {
      // V2 interface accepts same parameters, pass through directly
      return await runtime._v2Runtime.getCachedEmbeddings(params);
    },

    log: async (params: {
      body: { [key: string]: unknown };
      userId: V1UUID;
      roomId: V1UUID;
      type: string;
    }): Promise<void> => {
      // Map V1 userId to V2 entityId
      const v2Params = {
        body: params.body,
        entityId: params.userId as any, // V1 userId -> V2 entityId
        roomId: params.roomId as any,
        type: params.type,
      };

      try {
        await runtime._v2Runtime.log(v2Params);
      } catch (error) {
        console.error(`[DB Proxy] Error in log:`, error);
        throw error;
      }
    },

    getActorDetails: async (params: { roomId: V1UUID }): Promise<V1Actor[]> => {
      try {
        // Get entities for room
        const entities = await runtime._v2Runtime.getEntitiesForRoom(params.roomId as any, true);

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
        console.error(`[DB Proxy] Error in getActorDetails:`, error);
        return []; // Return empty array on error
      }
    },

    searchMemories: async (params: {
      tableName: string;
      agentId: V1UUID;
      roomId: V1UUID;
      embedding: number[];
      match_threshold: number;
      match_count: number;
      unique: boolean;
    }): Promise<V1Memory[]> => {
      // Check if the V1 agentId matches the V2 runtime's agentId
      if (params.agentId !== runtime._v2Runtime.agentId) {
        console.warn(
          `[DB Proxy] searchMemories called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${runtime._v2Runtime.agentId}.`
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
      const v2Memories = await runtime._v2Runtime.searchMemories(v2Params);

      // Translate results back to V1 format
      return v2Memories.map((memory) => translateV2MemoryToV1(memory));
    },

    updateGoalStatus: async (params: { goalId: V1UUID; status: V1GoalStatus }): Promise<void> => {
      try {
        console.log(`[DB Proxy] Updating goal status for ${params.goalId} to ${params.status}`);

        // Get the current task from V2
        const existingTask = await runtime._v2Runtime.getTask(params.goalId as UUID);
        if (!existingTask?.metadata?.v1_compat) {
          console.warn(
            `[DB Proxy] updateGoalStatus: Task ${params.goalId} not found or not a V1 compatible task.`
          );
          return;
        }

        // Prepare partial update with just the status change
        const updatedMetadata = {
          ...existingTask.metadata, // Keep existing metadata
          v1_status: params.status, // Update only the status
        };

        // Call V2 updateTask with partial update
        await runtime._v2Runtime.updateTask(params.goalId as UUID, { metadata: updatedMetadata });
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 updateTask for V1 updateGoalStatus (ID: ${params.goalId}):`,
          error
        );
        throw error;
      }
    },

    searchMemoriesByEmbedding: async (
      embedding: number[],
      params: {
        match_threshold?: number;
        count?: number;
        roomId?: V1UUID;
        agentId?: V1UUID;
        unique?: boolean;
        tableName: string;
      }
    ): Promise<V1Memory[]> => {
      // Check if the V1 agentId matches the V2 runtime's agentId
      if (params.agentId && params.agentId !== runtime._v2Runtime.agentId) {
        console.warn(
          `[DB Proxy] searchMemoriesByEmbedding called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${runtime._v2Runtime.agentId}.`
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
      const v2Memories = await runtime._v2Runtime.searchMemories(v2Params);

      // Translate results back to V1 format
      return v2Memories.map((memory) => translateV2MemoryToV1(memory));
    },

    createMemory: async (memory: V1Memory, tableName: string, unique?: boolean): Promise<void> => {
      // Convert V1 memory to V2 format
      const v2Memory = translateV1MemoryToV2(memory);

      // Call V2 equivalent
      await runtime._v2Runtime.createMemory(v2Memory, tableName, unique);
    },

    removeMemory: async (memoryId: V1UUID, tableName: string): Promise<void> => {
      // V2 uses deleteMemory instead of removeMemory and doesn't require tableName
      await runtime._v2Runtime.deleteMemory(memoryId);
    },

    removeAllMemories: async (roomId: V1UUID, tableName: string): Promise<void> => {
      // Call V2 equivalent which has the same signature
      await runtime._v2Runtime.deleteAllMemories(roomId, tableName);
    },

    countMemories: async (
      roomId: V1UUID,
      unique?: boolean,
      tableName?: string
    ): Promise<number> => {
      // Call V2 equivalent which has the same signature
      return await runtime._v2Runtime.countMemories(roomId, unique, tableName);
    },

    // Goal methods
    getGoals: async (params: {
      agentId: V1UUID;
      roomId: V1UUID;
      userId?: V1UUID | null;
      onlyInProgress?: boolean;
      count?: number;
    }): Promise<V1Goal[]> => {
      try {
        // Check agentId
        if (params.agentId !== runtime.agentId) {
          console.warn(
            `[DB Proxy] getGoals called with mismatched agentId. Using runtime agentId: ${runtime.agentId}`
          );
        }

        // Fetch potentially relevant tasks from V2
        // Request a higher limit than needed to allow for filtering
        const v2Limit = params.count ? params.count * 2 : 20;
        const v2Tasks = await runtime._v2Runtime.getTasks({
          roomId: params.roomId as UUID,
          tags: ['v1_goal_compat'], // Filter by compatibility tag
          // In V2, we don't need to specify agentId since it's implicit
        });

        console.log(`[DB Proxy] Found ${v2Tasks.length} potential V1-compatible tasks`);

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

        console.log(`[DB Proxy] Returning ${v1Goals.length} V1 goals after filtering`);
        return v1Goals;
      } catch (error) {
        console.error(`[DB Proxy] Error in getGoals:`, error);
        throw error;
      }
    },

    updateGoal: async (goal: V1Goal): Promise<void> => {
      if (!goal.id) {
        throw new Error('[DB Proxy] updateGoal requires goal object with an ID.');
      }

      try {
        console.log(`[DB Proxy] Updating goal "${goal.name}" (${goal.id})`);

        // Get the current task from V2
        const existingTask = await runtime._v2Runtime.getTask(goal.id as UUID);
        if (!existingTask?.metadata?.v1_compat) {
          console.warn(
            `[DB Proxy] updateGoal: Task ${goal.id} not found or not a V1 compatible task. Cannot update.`
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
        const taskUpdate: Partial<any> = {
          metadata: updatedMetadata,
        };

        if (goal.name !== existingTask.name) {
          taskUpdate.name = goal.name;
        }

        // Call V2 updateTask with partial update
        await runtime._v2Runtime.updateTask(goal.id as UUID, taskUpdate);
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 updateTask for V1 updateGoal (ID: ${goal.id}):`,
          error
        );
        throw error;
      }
    },

    createGoal: async (goal: V1Goal): Promise<void> => {
      try {
        console.log(`[DB Proxy] Creating goal "${goal.name}" (${goal.id})`);

        // Translate V1 Goal to V2 Task using the translator function
        const task = translateV1GoalToV2Task(goal);

        // Create the task in V2
        await runtime._v2Runtime.createTask(task);

        // V1 returns void
      } catch (error) {
        console.error(`[DB Proxy] Error calling V2 createTask for V1 createGoal:`, error);
        throw error;
      }
    },

    removeGoal: async (goalId: V1UUID): Promise<void> => {
      try {
        console.log(`[DB Proxy] Removing goal ${goalId}`);

        // V2 deleteTask works directly with the ID
        await runtime._v2Runtime.deleteTask(goalId as UUID);
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 deleteTask for V1 removeGoal (ID: ${goalId}):`,
          error
        );

        // Don't throw if task doesn't exist - V1 might have handled this silently
        if (!error.message?.includes('not found')) {
          throw error;
        }
      }
    },

    removeAllGoals: async (roomId: V1UUID): Promise<void> => {
      try {
        console.log(`[DB Proxy] Removing all goals for room ${roomId}`);

        // Find all V1-compatible tasks in the room
        const v1CompatTasks = await runtime._v2Runtime.getTasks({
          roomId: roomId as UUID,
          tags: ['v1_goal_compat'],
        });

        console.log(`[DB Proxy] Found ${v1CompatTasks.length} V1-compatible goals to remove`);

        // Delete each found task
        if (v1CompatTasks.length > 0) {
          const deletePromises = v1CompatTasks.map((task) =>
            runtime._v2Runtime.deleteTask(task.id!)
          );

          await Promise.all(deletePromises);
        }
      } catch (error) {
        console.error(
          `[DB Proxy] Error during V1 removeAllGoals simulation (Room: ${roomId}):`,
          error
        );
        throw error;
      }
    },

    // Room methods
    getRoom: async (roomId: V1UUID): Promise<V1UUID | null> => {
      try {
        const v2Room = await runtime._v2Runtime.getRoom(roomId as any);
        // V1 expects the ID string back, or null if not found
        return v2Room ? (v2Room.id as V1UUID) : null;
      } catch (error) {
        console.error(`[DB Proxy] Error calling V2 getRoom for roomId ${roomId}:`, error);
        throw error;
      }
    },

    createRoom: async (roomId?: V1UUID): Promise<V1UUID> => {
      // Determine the ID to use: provided V1 ID or generate a new one
      const idToUse = (roomId || generateUuidFromString(Date.now().toString())) as any;

      // Construct the V2 Room object with necessary defaults
      const v2RoomData = {
        id: idToUse,
        agentId: runtime._v2Runtime.agentId, // Associate with current agent
        source: 'v1_compat_create', // Indicate origin
        type: 'UNKNOWN', // Default type since V1 didn't specify type
        name: `V1 Compat Room ${idToUse.slice(0, 8)}`, // Default name
        metadata: { v1_compat: true },
      };

      try {
        // Call V2 createRoom
        const createdRoomId = await runtime._v2Runtime.createRoom(v2RoomData);
        // Both V1 and V2 return the UUID string
        return createdRoomId as V1UUID;
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 createRoom for V1 createRoom (ID: ${idToUse}):`,
          error
        );
        // Handle duplicate errors if V1 might have ignored them
        if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
          console.warn(
            `[DB Proxy] createRoom: Room ${idToUse} likely already exists (duplicate key). Returning existing ID.`
          );
          return idToUse as V1UUID; // Return the ID that likely exists
        }
        throw error; // Re-throw other errors
      }
    },

    removeRoom: async (roomId: V1UUID): Promise<void> => {
      try {
        // Call V2 equivalent with the correct name
        await runtime._v2Runtime.deleteRoom(roomId as any);
        // V1 returns void
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 deleteRoom for V1 removeRoom (ID: ${roomId}):`,
          error
        );
        // Don't throw if V2 errors on non-existent ID, V1 might expect that
        if (!error.message?.includes('not found')) {
          throw error;
        }
      }
    },

    getRoomsForParticipant: async (userId: V1UUID): Promise<V1UUID[]> => {
      try {
        // Map V1 userId to V2 entityId parameter
        const roomIds = await runtime._v2Runtime.getRoomsForParticipant(userId as any);
        // Return type UUID[] is compatible
        return roomIds as V1UUID[];
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 getRoomsForParticipant for userId ${userId}:`,
          error
        );
        throw error;
      }
    },

    getRoomsForParticipants: async (userIds: V1UUID[]): Promise<V1UUID[]> => {
      try {
        // Signature and types match, delegate directly
        const roomIds = await runtime._v2Runtime.getRoomsForParticipants(userIds as any[]);
        return roomIds as V1UUID[];
      } catch (error) {
        console.error(`[DB Proxy] Error calling V2 getRoomsForParticipants:`, error);
        throw error;
      }
    },

    // Participant methods
    addParticipant: async (userId: V1UUID, roomId: V1UUID): Promise<boolean> => {
      try {
        // Map V1 userId to V2 entityId parameter
        const success = await runtime._v2Runtime.addParticipant(userId as any, roomId as any);
        return success;
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 addParticipant (User: ${userId}, Room: ${roomId}):`,
          error
        );
        // Handle specific errors? V1 might expect false on failure.
        if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
          console.warn(
            `[DB Proxy] addParticipant: User ${userId} likely already in room ${roomId}. Simulating V1 success.`
          );
          return true; // V1 might not have errored if already present
        }
        // Return false for compatibility with V1 expectation of boolean result
        return false;
      }
    },

    removeParticipant: async (userId: V1UUID, roomId: V1UUID): Promise<boolean> => {
      try {
        // Map V1 userId to V2 entityId parameter
        const success = await runtime._v2Runtime.removeParticipant(userId as any, roomId as any);
        return success;
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 removeParticipant (User: ${userId}, Room: ${roomId}):`,
          error
        );
        // V1 might expect false on failure or if participant wasn't found
        return false;
      }
    },

    getParticipantsForAccount: async (userId: V1UUID): Promise<V1Participant[]> => {
      try {
        // Map V1 userId to V2 entityId parameter and call V2 method
        const v2Participants = await runtime._v2Runtime.getParticipantsForEntity(userId as any);

        // Translate V2Participant[] -> V1Participant[]
        const v1Participants = v2Participants
          .map((v2Participant) => {
            if (!v2Participant.entity) {
              console.warn(`[DB Proxy] No entity for participant ${v2Participant.id}`);
              return null;
            }

            const entity = v2Participant.entity;

            const v1Account = {
              id: entity.id as V1UUID,
              name: entity.names?.[0] || 'Unknown',
              username: entity.names?.[1] || entity.names?.[0] || 'unknown',
              details: entity.metadata || {},
              email: entity.metadata?.email || entity.id,
              avatarUrl: entity.metadata?.avatarUrl,
            };

            return {
              id: v2Participant.id as V1UUID,
              account: v1Account,
            };
          })
          .filter((p): p is V1Participant => p !== null); // Filter out any nulls from failed translations

        return v1Participants;
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 getParticipantsForEntity for userId ${userId}:`,
          error
        );
        throw error;
      }
    },

    getParticipantsForRoom: async (roomId: V1UUID): Promise<V1UUID[]> => {
      // Signature and return type (array of UUID strings) match V1 and V2.
      // Direct delegation is sufficient here.
      try {
        return await runtime._v2Runtime.getParticipantsForRoom(roomId);
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 getParticipantsForRoom for roomId ${roomId}:`,
          error
        );
        throw error;
      }
    },

    getParticipantUserState: async (
      roomId: V1UUID,
      userId: V1UUID
    ): Promise<'FOLLOWED' | 'MUTED' | null> => {
      try {
        // Map V1 userId to V2 entityId parameter
        const state = await runtime._v2Runtime.getParticipantUserState(
          roomId as any,
          userId as any
        );
        return state; // Return type is compatible
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 getParticipantUserState (Room: ${roomId}, User: ${userId}):`,
          error
        );
        throw error;
      }
    },

    setParticipantUserState: async (
      roomId: V1UUID,
      userId: V1UUID,
      state: 'FOLLOWED' | 'MUTED' | null
    ): Promise<void> => {
      try {
        // Map V1 userId to V2 entityId parameter
        await runtime._v2Runtime.setParticipantUserState(roomId as any, userId as any, state);
        // V1 returns void
      } catch (error) {
        console.error(
          `[DB Proxy] Error calling V2 setParticipantUserState (Room: ${roomId}, User: ${userId}, State: ${state}):`,
          error
        );
        throw error;
      }
    },

    // Relationship methods
    createRelationship: async (params: { userA: V1UUID; userB: V1UUID }): Promise<boolean> => {
      try {
        // V2 allows tags/metadata, but V1 didn't provide them.
        return await runtime._v2Runtime.createRelationship({
          sourceEntityId: params.userA as any,
          targetEntityId: params.userB as any,
        });
      } catch (error) {
        console.error(`[DB Proxy] Error calling V2 createRelationship:`, error);
        // Handle duplicate errors if V1 might have ignored them
        if (error.message?.includes('duplicate key') || (error as any).code === '23505') {
          console.warn(
            `[DB Proxy] createRelationship: Relationship likely already exists (duplicate key). Simulating V1 success.`
          );
          return true;
        }
        throw error; // Re-throw other errors
      }
    },

    getRelationship: async (params: {
      userA: V1UUID;
      userB: V1UUID;
    }): Promise<V1Relationship | null> => {
      try {
        // Check A -> B
        let v2Rel = await runtime._v2Runtime.getRelationship({
          sourceEntityId: params.userA as any,
          targetEntityId: params.userB as any,
        });

        // If not found, check B -> A for V1 compatibility
        if (!v2Rel) {
          v2Rel = await runtime._v2Runtime.getRelationship({
            sourceEntityId: params.userB as any,
            targetEntityId: params.userA as any,
          });
        }

        // Translate if found
        if (!v2Rel) return null;

        const DEFAULT_V1_ROOM_ID = '00000000-0000-0000-0000-000000000000' as V1UUID;
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
      } catch (error) {
        console.error(`[DB Proxy] Error calling V2 getRelationship:`, error);
        throw error;
      }
    },

    getRelationships: async (params: { userId: V1UUID }): Promise<V1Relationship[]> => {
      try {
        // Map V1 userId to V2 entityId
        const v2Rels = await runtime._v2Runtime.getRelationships({
          entityId: params.userId as any,
          // V1 didn't support tag filtering here
        });

        // Translate results to V1 format
        const DEFAULT_V1_ROOM_ID = '00000000-0000-0000-0000-000000000000' as V1UUID;
        const DEFAULT_V1_STATUS = 'connected';

        return v2Rels.map((v2Rel) => ({
          id: v2Rel.id as V1UUID,
          userA: v2Rel.sourceEntityId as V1UUID,
          userB: v2Rel.targetEntityId as V1UUID,
          userId: v2Rel.agentId as V1UUID,
          roomId: (v2Rel.metadata?.roomId || DEFAULT_V1_ROOM_ID) as V1UUID,
          status: v2Rel.tags?.[0] || DEFAULT_V1_STATUS,
          createdAt: v2Rel.createdAt,
        }));
      } catch (error) {
        console.error(`[DB Proxy] Error calling V2 getRelationships:`, error);
        throw error;
      }
    },

    // Knowledge methods
    getKnowledge: async (params: {
      id?: V1UUID;
      agentId: V1UUID;
      limit?: number;
      query?: string;
      conversationContext?: string;
    }): Promise<V1RAGKnowledgeItem[]> => {
      try {
        console.log(`[DB Proxy] getKnowledge for agentId ${params.agentId}`);

        // This should be delegated to the ragKnowledgeManager in runtime
        return await runtime.ragKnowledgeManager.getKnowledge(params);
      } catch (error) {
        console.error(`[DB Proxy] Error in getKnowledge:`, error);
        throw error;
      }
    },

    searchKnowledge: async (params: {
      agentId: V1UUID;
      embedding: Float32Array;
      match_threshold: number;
      match_count: number;
      searchText?: string;
    }): Promise<V1RAGKnowledgeItem[]> => {
      try {
        console.log(`[DB Proxy] searchKnowledge for agentId ${params.agentId}`);

        // This should be delegated to the ragKnowledgeManager in runtime
        return await runtime.ragKnowledgeManager.searchKnowledge(params);
      } catch (error) {
        console.error(`[DB Proxy] Error in searchKnowledge:`, error);
        throw error;
      }
    },

    createKnowledge: async (knowledge: V1RAGKnowledgeItem): Promise<void> => {
      try {
        console.log(`[DB Proxy] createKnowledge for item ${knowledge.id}`);

        // This should be delegated to the ragKnowledgeManager in runtime
        return await runtime.ragKnowledgeManager.createKnowledge(knowledge);
      } catch (error) {
        console.error(`[DB Proxy] Error in createKnowledge:`, error);
        throw error;
      }
    },

    removeKnowledge: async (id: V1UUID): Promise<void> => {
      try {
        console.log(`[DB Proxy] removeKnowledge for id ${id}`);

        // This should be delegated to the ragKnowledgeManager in runtime
        return await runtime.ragKnowledgeManager.removeKnowledge(id);
      } catch (error) {
        console.error(`[DB Proxy] Error in removeKnowledge:`, error);
        throw error;
      }
    },

    clearKnowledge: async (agentId: V1UUID, shared?: boolean): Promise<void> => {
      try {
        console.log(`[DB Proxy] clearKnowledge for agentId ${agentId}, shared: ${shared}`);

        // Make sure the agent ID matches the runtime
        if (agentId !== runtime.agentId) {
          console.warn(
            `[DB Proxy] clearKnowledge called with mismatched agentId. Using current runtime agentId: ${runtime.agentId}`
          );
        }

        // This should be delegated to the ragKnowledgeManager in runtime
        return await runtime.ragKnowledgeManager.clearKnowledge(shared);
      } catch (error) {
        console.error(`[DB Proxy] Error in clearKnowledge:`, error);
        throw error;
      }
    },

    // Cache methods
    getCache: async (params) => {
      return runtime._v2Runtime.getCache(params.key) as Promise<string | undefined>;
    },

    setCache: async (params) => {
      return runtime._v2Runtime.setCache(params.key, params.value);
    },

    deleteCache: async (params) => {
      return runtime._v2Runtime.deleteCache(params.key);
    },
  } as V1IDatabaseAdapter & IDatabaseCacheAdapter;

  return proxy;
}

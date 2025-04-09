import {
  IDatabaseAdapter as V1IDatabaseAdapter,
  IDatabaseCacheAdapter,
  UUID as V1UUID,
} from '../types';
import type { CompatAgentRuntime } from '../runtime';

/**
 * Creates a proxy object that implements the V1 IDatabaseAdapter & IDatabaseCacheAdapter interfaces
 * and delegates calls to the CompatAgentRuntime instance.
 */
export function createDbAdapterProxy(
  runtime: CompatAgentRuntime
): V1IDatabaseAdapter & IDatabaseCacheAdapter {
  const v2Runtime = runtime.getV2Runtime();

  // This proxy forwards all method calls to the CompatAgentRuntime instance
  const proxy = {
    db: v2Runtime.db,
    init: () => runtime.initialize(),
    close: () => Promise.resolve(),

    // Forward all database methods to runtime instance
    getAccountById: (userId) => runtime.getAccountById(userId),
    createAccount: (account) => runtime.createAccount(account),
    getMemories: (params) => runtime.getMemories(params),
    getMemoryById: (id) => runtime.getMemoryById(id),
    getMemoriesByIds: (ids, tableName) => runtime.getMemoriesByIds(ids, tableName),
    getMemoriesByRoomIds: (params) => runtime.getMemoriesByRoomIds(params),
    getCachedEmbeddings: (params) => runtime.getCachedEmbeddings(params),
    log: (params) => runtime.log(params),
    getActorDetails: (params) => runtime.getActorDetails(params),
    searchMemories: (params) => runtime.searchMemories(params),
    updateGoalStatus: (params) => runtime.updateGoalStatus(params),
    searchMemoriesByEmbedding: (embedding, params) =>
      runtime.searchMemoriesByEmbedding(embedding, params),
    createMemory: (memory, tableName, unique) => runtime.createMemory(memory, tableName, unique),
    removeMemory: (memoryId, tableName) => runtime.removeMemory(memoryId, tableName),
    removeAllMemories: (roomId, tableName) => runtime.removeAllMemories(roomId, tableName),
    countMemories: (roomId, unique, tableName) => runtime.countMemories(roomId, unique, tableName),
    getGoals: (params) => runtime.getGoals(params),
    updateGoal: (goal) => runtime.updateGoal(goal),
    createGoal: (goal) => runtime.createGoal(goal),
    removeGoal: (goalId) => runtime.removeGoal(goalId),
    removeAllGoals: (roomId) => runtime.removeAllGoals(roomId),
    getRoom: (roomId) => runtime.getRoom(roomId),
    createRoom: (roomId) => runtime.createRoom(roomId),
    removeRoom: (roomId) => runtime.removeRoom(roomId),
    getRoomsForParticipant: (userId) => runtime.getRoomsForParticipant(userId),
    getRoomsForParticipants: (userIds) => runtime.getRoomsForParticipants(userIds),
    addParticipant: (userId, roomId) => runtime.addParticipant(userId, roomId),
    removeParticipant: (userId, roomId) => runtime.removeParticipant(userId, roomId),
    getParticipantsForAccount: (userId) => runtime.getParticipantsForAccount(userId),
    getParticipantsForRoom: (roomId) => runtime.getParticipantsForRoom(roomId),
    getParticipantUserState: (roomId, userId) => runtime.getParticipantUserState(roomId, userId),
    setParticipantUserState: (roomId, userId, state) =>
      runtime.setParticipantUserState(roomId, userId, state),
    createRelationship: (params) => runtime.createRelationship(params),
    getRelationship: (params) => runtime.getRelationship(params),
    getRelationships: (params) => runtime.getRelationships(params),
    getKnowledge: (params) => runtime.getKnowledge(params),
    searchKnowledge: (params) => runtime.searchKnowledge(params),
    createKnowledge: (knowledge) => runtime.createKnowledge(knowledge),
    removeKnowledge: (id) => runtime.removeKnowledge(id),
    clearKnowledge: (agentId, shared) => runtime.clearKnowledge(agentId, shared),

    // Cache methods
    getCache: async (params) => {
      return v2Runtime.getCache(params.key) as Promise<string | undefined>;
    },
    setCache: async (params) => {
      return v2Runtime.setCache(params.key, params.value);
    },
    deleteCache: async (params) => {
      return v2Runtime.deleteCache(params.key);
    },
  } as V1IDatabaseAdapter & IDatabaseCacheAdapter;

  return proxy;
}

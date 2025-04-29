import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PgDatabaseAdapter } from '../../src/pg/adapter';
import { PostgresConnectionManager } from '../../src/pg/manager';
import { type UUID } from '@elizaos/core';
import { config } from './seed/config';
import {
  embeddingTestAgentId,
  embeddingTestRoomId,
  embeddingTestMemories,
  embeddingTestMemoriesWithEmbedding,
  createSimilarMemory,
  generateRandomVector,
  embeddingTestAgent,
  embeddingTestEntity,
  embeddingTestRoom,
  embeddingTestEntityId,
  embeddingTestWorldId,
} from './seed/embedding-seed';

// Mock only the logger
vi.mock('@elizaos/core', async () => {
  const actual = await vi.importActual('@elizaos/core');
  return {
    ...actual,
    logger: {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      success: vi.fn(),
    },
  };
});

describe('Embedding Integration Tests', () => {
  // Database connection variables
  let connectionManager: PostgresConnectionManager;
  let adapter: PgDatabaseAdapter;
  let agentId: UUID = embeddingTestAgentId;

  beforeAll(async () => {
    // Initialize connection manager and adapter
    connectionManager = new PostgresConnectionManager(config.DATABASE_URL);
    await connectionManager.initialize();
    adapter = new PgDatabaseAdapter(agentId, connectionManager);
    await adapter.init();

    try {
      // Step 1: Create test agent
      await adapter.createAgent(embeddingTestAgent);

      // Step 2: Create test world
      await adapter.createWorld({
        id: embeddingTestWorldId,
        name: 'Embedding Test World',
        agentId: embeddingTestAgentId,
        serverId: 'test-server',
      });

      // Step 3: Create test entity
      await adapter.createEntity(embeddingTestEntity);

      // Step 4: Create test room
      await adapter.createRoom(embeddingTestRoom);

      // Step 5: Add entity as participant in the room
      await adapter.addParticipant(embeddingTestEntityId, embeddingTestRoomId);
    } catch (error) {
      console.error('Error in setup:', error);
      throw error;
    }
  }, 10000);

  afterAll(async () => {
    // Clean up test data
    const client = await connectionManager.getClient();
    try {
      // Order matters for foreign key constraints
      await client.query('DELETE FROM embeddings WHERE TRUE');
      await client.query('DELETE FROM participants WHERE TRUE');
      await client.query(`DELETE FROM memories WHERE "roomId" = '${embeddingTestRoomId}'`);
      await client.query(`DELETE FROM rooms WHERE id = '${embeddingTestRoomId}'`);
      await client.query(`DELETE FROM entities WHERE id = '${embeddingTestEntityId}'`);
      await client.query(`DELETE FROM worlds WHERE id = '${embeddingTestWorldId}'`);
      await client.query(`DELETE FROM agents WHERE id = '${embeddingTestAgentId}'`);
    } catch (error) {
      console.error('Error cleaning test data:', error);
    } finally {
      client.release();
    }

    // Close all connections
    await adapter.close();
  }, 10000);

  beforeEach(async () => {
    // Clean up any existing test memories before each test
    const client = await connectionManager.getClient();
    try {
      await client.query('DELETE FROM embeddings WHERE TRUE');
      await client.query(`DELETE FROM memories WHERE "roomId" = '${embeddingTestRoomId}'`);
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('createMemory with embedding', () => {
    it.only('should successfully create a memory with an embedding', async () => {
      // Use the first test memory with embedding
      const memory = embeddingTestMemoriesWithEmbedding[0];

      console.log('Memory:', memory);

      // Create memory with embedding
      const memoryId = await adapter.createMemory(memory, 'memories');

      expect(memoryId).toBeDefined();
      expect(memoryId).toEqual(memory.id);

      // Retrieve memory to verify embedding was stored
      const createdMemory = await adapter.getMemoryById(memoryId);

      expect(createdMemory).not.toBeNull();
      expect(createdMemory?.id).toEqual(memory.id);
      expect(createdMemory?.embedding).toBeDefined();
      expect(Array.isArray(createdMemory?.embedding)).toBe(true);
      expect(createdMemory?.embedding?.length).toEqual(memory.embedding.length);
    });

    it('should create memories with different embedding dimensions', async () => {
      // Create three memories with the same dimension (384)
      const results = await Promise.all(
        embeddingTestMemoriesWithEmbedding.map((memory) => adapter.createMemory(memory, 'memories'))
      );

      // Verify all memories were created
      expect(results).toHaveLength(embeddingTestMemoriesWithEmbedding.length);

      // Verify each memory's embedding
      for (let i = 0; i < embeddingTestMemoriesWithEmbedding.length; i++) {
        const memory = await adapter.getMemoryById(results[i]);
        expect(memory).not.toBeNull();
        expect(memory?.embedding).toBeDefined();
        expect(Array.isArray(memory?.embedding)).toBe(true);
        expect(memory?.embedding?.length).toEqual(384);
      }
    });
  });

  describe('searchMemoriesByEmbedding', () => {
    it('should find similar memories by embedding', async () => {
      // Create all test memories with embeddings
      await Promise.all(
        embeddingTestMemoriesWithEmbedding.map((memory) => adapter.createMemory(memory, 'memories'))
      );

      // Create a similar memory to the first one
      const originalMemory = embeddingTestMemoriesWithEmbedding[0];
      const similarMemory = createSimilarMemory(originalMemory, 0.95);

      // Search for memories similar to the vector of the similar memory
      const results = await adapter.searchMemoriesByEmbedding(similarMemory.embedding, {
        tableName: 'memories',
        match_threshold: 0.9,
        count: 5,
      });

      // Expect to find at least the original memory
      expect(results.length).toBeGreaterThan(0);

      // The most similar memory should be the original one
      const foundOriginal = results.some((m) => m.id === originalMemory.id);
      expect(foundOriginal).toBe(true);

      // Verify similarity scores
      results.forEach((memory) => {
        expect(memory.similarity).toBeDefined();
        expect(memory.similarity).toBeGreaterThan(0.8);
      });
    });

    it('should not find memories when similarity threshold is too high', async () => {
      // Create all test memories with embeddings
      await Promise.all(
        embeddingTestMemoriesWithEmbedding.map((memory) => adapter.createMemory(memory, 'memories'))
      );

      // Generate a random vector that should not be similar to any existing ones
      const randomVector = generateRandomVector(384);

      // Search with a high threshold
      const results = await adapter.searchMemoriesByEmbedding(randomVector, {
        tableName: 'memories',
        match_threshold: 0.99,
        count: 5,
      });

      // Expect to find no similar memories with that high threshold
      expect(results.length).toBe(0);
    });
  });

  describe('ensureEmbeddingDimension', () => {
    it('should set the embedding dimension for the adapter', async () => {
      // Set dimension to 768
      await adapter.ensureEmbeddingDimension(768);

      // Create a memory with 768-dimensional embedding
      const testMemory = {
        ...embeddingTestMemories[0],
        embedding: generateRandomVector(768),
      };

      const memoryId = await adapter.createMemory(testMemory, 'memories');

      // Verify memory was created with the correct dimension
      const createdMemory = await adapter.getMemoryById(memoryId);
      expect(createdMemory).not.toBeNull();
      expect(createdMemory?.embedding).toBeDefined();
      expect(createdMemory?.embedding?.length).toBe(768);

      // Reset to default dimension
      await adapter.ensureEmbeddingDimension(384);
    });
  });
});

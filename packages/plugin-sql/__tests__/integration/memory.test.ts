import { describe, expect, it, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { PgDatabaseAdapter } from '../../src/pg/adapter';
import { PostgresConnectionManager } from '../../src/pg/manager';
import { ChannelType, type UUID } from '@elizaos/core';
import { config } from './seed/config';
import {
  memoryTestAgentId,
  memoryTestRoomId,
  memoryTestMemories,
  memoryTestMemoriesWithEmbedding,
  createSimilarMemoryVector,
  memoryTestAgent,
  memoryTestEntity,
  memoryTestRoom,
  memoryTestEntityId,
  memoryTestWorldId,
  memoryTestWorld,
  documentMemoryId,
  memoryTestDocument,
  memoryTestFragments,
} from './seed/memory-seed';

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

describe('Memory Integration Tests', () => {
  // Database connection variables
  let connectionManager: PostgresConnectionManager;
  let adapter: PgDatabaseAdapter;
  let agentId: UUID = memoryTestAgentId;

  console.log('agentId:', agentId);

  beforeAll(async () => {
    // Initialize connection manager and adapter
    connectionManager = new PostgresConnectionManager(config.DATABASE_URL);
    await connectionManager.initialize();
    adapter = new PgDatabaseAdapter(agentId, connectionManager);
    await adapter.init();

    console.log('Starting test data setup...');

    try {
      // Step 1: Create test agent
      console.log('Creating agent with ID:', agentId);
      const agent = await adapter.ensureAgentExists(memoryTestAgent);
      console.log('Agent created:', agent);

      // Step 2: Create test world
      console.log('Creating world with ID:', memoryTestWorldId);
      await adapter.createWorld({
        ...memoryTestWorld,
        agentId: memoryTestAgentId,
      });
      console.log('World created successfully');

      // Step 3: Create test entity
      console.log('Creating entity with ID:', memoryTestEntityId);
      const entityCreated = await adapter.createEntity(memoryTestEntity);
      console.log('Entity created:', entityCreated);

      // Step 4: Create test room
      console.log('Creating room with ID:', memoryTestRoomId);
      const roomId = await adapter.createRoom(memoryTestRoom);
      console.log('Room created with ID:', roomId);

      // Step 5: Add entity as participant in the room
      console.log('Adding entity as participant to room');
      await adapter.addParticipant(memoryTestEntityId, memoryTestRoomId);
      console.log('Entity added as participant');
    } catch (error) {
      console.error('Error in setup:', error);
      throw error;
    }
  }, 10000);

  afterAll(async () => {
    // Clean up test data
    const client = await connectionManager.getClient();
    try {
      console.log('Cleaning up test data...');
      // Order matters for foreign key constraints
      await client.query('DELETE FROM embeddings WHERE TRUE');
      await client.query('DELETE FROM participants WHERE TRUE');
      await client.query(`DELETE FROM memories WHERE "roomId" = '${memoryTestRoomId}'`);
      await client.query(`DELETE FROM rooms WHERE id = '${memoryTestRoomId}'`);
      await client.query(`DELETE FROM entities WHERE id = '${memoryTestEntityId}'`);
      await client.query(`DELETE FROM worlds WHERE id = '${memoryTestWorldId}'`);
      await client.query(`DELETE FROM agents WHERE id = '${memoryTestAgentId}'`);
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
      await client.query(`DELETE FROM memories WHERE "roomId" = '${memoryTestRoomId}'`);
    } finally {
      client.release();
    }
  });

  afterEach(async () => {
    vi.clearAllMocks();
  });

  describe('Memory CRUD Operations', () => {
    it('should create a simple memory without embedding', async () => {
      const memory = {
        ...memoryTestMemories[0],
        embedding: undefined, // Explicitly remove embedding if present
      };

      const memoryId = await adapter.createMemory(memory, 'memories');
      expect(memoryId).toBe(memory.id);

      // Verify it exists in the database
      const createdMemory = await adapter.getMemoryById(memoryId);
      expect(createdMemory).not.toBeNull();
      expect(createdMemory?.content.text).toBe(memory.content.text);
    });

    it('should create a memory with embedding', async () => {
      const memory = memoryTestMemoriesWithEmbedding[0];

      const memoryId = await adapter.createMemory(memory, 'memories');
      expect(memoryId).toBe(memory.id);

      // Verify it exists and has the embedding
      const createdMemory = await adapter.getMemoryById(memoryId);
      expect(createdMemory).not.toBeNull();
      expect(createdMemory?.embedding).toBeDefined();
      expect(createdMemory?.embedding?.length).toBe(memory.embedding?.length);
    });

    it('should update an existing memory', async () => {
      // Create a memory first
      const memory = memoryTestMemories[0];
      const memoryId = await adapter.createMemory(memory, 'memories');

      // Update the memory
      const updatedContent = {
        text: 'This memory has been updated',
        type: 'text',
      };

      const updateResult = await adapter.updateMemory({
        id: memoryId,
        content: updatedContent,
        metadata: {
          type: 'test-updated',
          source: 'integration-test',
        },
      });

      expect(updateResult).toBe(true);

      // Verify the update
      const updatedMemory = await adapter.getMemoryById(memoryId);
      expect(updatedMemory?.content.text).toBe(updatedContent.text);
      expect(updatedMemory?.metadata?.type).toBe('test-updated');
    });

    it('should delete a memory', async () => {
      // Create a memory first
      const memory = memoryTestMemories[0];
      const memoryId = await adapter.createMemory(memory, 'memories');

      // Verify it exists
      const createdMemory = await adapter.getMemoryById(memoryId);
      expect(createdMemory).not.toBeNull();

      // Delete the memory
      await adapter.deleteMemory(memoryId);

      // Verify it's gone
      const deletedMemory = await adapter.getMemoryById(memoryId);
      expect(deletedMemory).toBeNull();
    });
  });

  describe('Memory Retrieval Operations', () => {
    it('should retrieve memories by room ID', async () => {
      // Create test memories first
      for (const memory of memoryTestMemories) {
        await adapter.createMemory(memory, 'memories');
      }

      // Retrieve memories
      const memories = await adapter.getMemories({
        roomId: memoryTestRoomId,
        tableName: 'memories',
      });

      console.log(`Retrieved ${memories.length} memories for room ${memoryTestRoomId}`);
      expect(memories).toHaveLength(memoryTestMemories.length);

      // Verify all memories belong to the correct room
      for (const memory of memories) {
        expect(memory.roomId).toBe(memoryTestRoomId);
      }
    });

    it('should count memories in a room', async () => {
      // Create test memories
      for (const memory of memoryTestMemories) {
        await adapter.createMemory(memory, 'memories');
      }

      const count = await adapter.countMemories(memoryTestRoomId, true, 'memories');
      expect(count).toEqual(memoryTestMemories.length);
    });

    it('should retrieve memories by ID list', async () => {
      // Create test memories and collect their IDs
      const memoryIds: UUID[] = [];

      for (const memory of memoryTestMemories.slice(0, 2)) {
        const memoryId = await adapter.createMemory(memory, 'memories');
        memoryIds.push(memoryId);
      }

      // Retrieve memories by IDs
      const memories = await adapter.getMemoriesByIds(memoryIds, 'memories');

      expect(memories).toHaveLength(2);
      expect(memories.map((m) => m.id)).toEqual(expect.arrayContaining(memoryIds));
    });

    it('should retrieve memories with pagination', async () => {
      // Create test memories
      for (const memory of memoryTestMemories) {
        await adapter.createMemory(memory, 'memories');
      }

      // Retrieve first page (limit to 2)
      const firstPage = await adapter.getMemories({
        roomId: memoryTestRoomId,
        tableName: 'memories',
        count: 2,
      });

      expect(firstPage).toHaveLength(2);

      // Test second page (remaining memories)
      const secondPage = await adapter.getMemories({
        roomId: memoryTestRoomId,
        tableName: 'memories',
      });

      // There should be at least 3 memories total
      expect(secondPage.length).toBeGreaterThanOrEqual(memoryTestMemories.length);
    });
  });

  describe('Memory Search Operations', () => {
    it('should search memories by embedding similarity', async () => {
      // Create memories with embeddings for search
      for (const memory of memoryTestMemoriesWithEmbedding) {
        await adapter.createMemory(memory, 'memories');
      }

      // Create a similar memory for testing search
      const baseMemory = memoryTestMemoriesWithEmbedding[0];
      const similarMemory = createSimilarMemoryVector(baseMemory, 0.9);

      await adapter.createMemory(similarMemory, 'memories');

      // Search using the original embedding
      const results = await adapter.searchMemoriesByEmbedding(baseMemory.embedding!, {
        match_threshold: 0.7,
        count: 5,
        roomId: memoryTestRoomId,
        tableName: 'memories',
      });

      // Should find at least one similar memory
      expect(results.length).toBeGreaterThan(0);

      // Most similar should be the original memory
      if (results.length > 0) {
        expect(results[0].similarity).toBeGreaterThan(0.9);
      }
    });
  });

  describe('Document and Fragment Operations', () => {
    it('should create a document with fragments', async () => {
      // Create the document
      await adapter.createMemory(memoryTestDocument, 'documents');

      // Create fragments that reference the document
      for (const fragment of memoryTestFragments) {
        await adapter.createMemory(fragment, 'fragments');
      }

      // Retrieve fragments for the document
      const fragments = await adapter.getMemories({
        tableName: 'fragments',
        roomId: memoryTestRoomId,
      });

      console.log(`Found ${fragments.length} fragments for document ${documentMemoryId}`);
      expect(fragments.length).toEqual(memoryTestFragments.length);
    });

    it('should delete a document and its fragments', async () => {
      // Create the document
      await adapter.createMemory(memoryTestDocument, 'documents');

      // Create fragments that reference the document
      for (const fragment of memoryTestFragments) {
        await adapter.createMemory(fragment, 'fragments');
      }

      // Delete the document (should cascade to fragments)
      await adapter.deleteMemory(documentMemoryId);

      // Verify document is deleted
      const document = await adapter.getMemoryById(documentMemoryId);
      expect(document).toBeNull();

      // Verify fragments are also deleted
      const fragments = await adapter.getMemories({
        tableName: 'fragments',
        roomId: memoryTestRoomId,
      });

      expect(fragments.length).toBe(0);
    });
  });

  describe('Memory Model Mapping', () => {
    it('should correctly map between Memory and MemoryModel', async () => {
      const testMemory = memoryTestMemories[0];

      // Create the memory
      await adapter.createMemory(testMemory, 'memories');

      // Retrieve it from database
      const retrievedMemory = await adapter.getMemoryById(testMemory.id as UUID);
      expect(retrievedMemory).not.toBeNull();

      // Verify all fields were properly mapped
      expect(retrievedMemory!.id).toBe(testMemory.id);
      expect(retrievedMemory!.entityId).toBe(testMemory.entityId);
      expect(retrievedMemory!.roomId).toBe(testMemory.roomId);
      expect(retrievedMemory!.agentId).toBe(testMemory.agentId);
      expect(retrievedMemory!.content.text).toBe(testMemory.content.text);
      expect(retrievedMemory!.metadata?.type).toBe(testMemory.metadata?.type);
    });

    it('should handle partial Memory objects in mapToMemoryModel', async () => {
      // Create a partial memory object
      const partialMemory: Partial<any> = {
        id: memoryTestAgentId, // Using a known UUID
        entityId: memoryTestEntityId,
        roomId: memoryTestRoomId,
        agentId: memoryTestAgentId,
        content: {
          text: 'Partial memory object',
          type: 'text',
        },
      };

      // Create the memory
      await adapter.createMemory(partialMemory as any, 'memories');

      // Retrieve it from database
      const retrievedMemory = await adapter.getMemoryById(partialMemory.id as UUID);
      expect(retrievedMemory).not.toBeNull();

      // Verify fields were properly mapped with defaults where applicable
      expect(retrievedMemory!.id).toBe(partialMemory.id);
      expect(retrievedMemory!.entityId).toBe(partialMemory.entityId);
      expect(retrievedMemory!.roomId).toBe(partialMemory.roomId);
      expect(retrievedMemory!.content.text).toBe(partialMemory.content?.text);
      expect(retrievedMemory!.unique).toBe(true); // Default value
      expect(retrievedMemory!.metadata).toBeDefined(); // Default empty object
    });
  });

  describe('Memory Batch Operations', () => {
    it('should delete all memories in a room', async () => {
      // Create test memories
      for (const memory of memoryTestMemories) {
        await adapter.createMemory(memory, 'memories');
      }

      // Verify memories exist
      const countBefore = await adapter.countMemories(memoryTestRoomId, true, 'memories');
      expect(countBefore).toBeGreaterThan(0);

      // Delete all memories
      await adapter.deleteAllMemories(memoryTestRoomId, 'memories');

      // Verify memories were deleted
      const countAfter = await adapter.countMemories(memoryTestRoomId, true, 'memories');
      expect(countAfter).toBe(0);
    });

    it('should retrieve memories by multiple room IDs', async () => {
      // Create a second room with its own world
      const secondWorldId = agentId as UUID; // Using a known UUID
      const secondRoomId = memoryTestEntityId; // Using a known UUID

      // Create the second world
      await adapter.createWorld({
        id: secondWorldId,
        name: 'Memory Test World 2',
        agentId: memoryTestAgentId,
        serverId: 'test-server-2',
      });

      // Create the second room
      await adapter.createRoom({
        id: secondRoomId,
        name: 'Memory Test Room 2',
        agentId: memoryTestAgentId,
        source: 'test',
        type: ChannelType.GROUP,
        worldId: secondWorldId,
      });

      // Create memories in first room
      for (const memory of memoryTestMemories.slice(0, 2)) {
        await adapter.createMemory(memory, 'memories');
      }

      // Create memories in second room
      for (const memory of memoryTestMemories.slice(2)) {
        const memoryInSecondRoom = {
          ...memory,
          roomId: secondRoomId,
        };
        await adapter.createMemory(memoryInSecondRoom, 'memories');
      }

      // Retrieve memories from both rooms
      const memories = await adapter.getMemoriesByRoomIds({
        roomIds: [memoryTestRoomId, secondRoomId],
        tableName: 'memories',
      });

      expect(memories.length).toEqual(memoryTestMemories.length);
    });
  });
});

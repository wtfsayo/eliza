import { IMemoryManager as V1IMemoryManager, Memory as V1Memory, UUID as V1UUID } from '../types';
import { translateV1MemoryToV2, translateV2MemoryToV1 } from '../translators/memory-translator';
import type { CompatAgentRuntime } from '../runtime';

/**
 * Creates a proxy object that implements the V1 IMemoryManager interface
 * for a specific memory table.
 */
export function createMemoryManagerProxy(
  runtime: CompatAgentRuntime,
  tableName: string
): V1IMemoryManager {
  const proxy = {
    runtime,
    tableName,
    constructor: Function,

    // Methods that delegate to the CompatAgentRuntime methods
    getMemories: async (opts) =>
      runtime.databaseAdapter.getMemories({ ...opts, tableName, agentId: runtime.agentId }),
    getMemoryById: async (id) => runtime.databaseAdapter.getMemoryById(id),
    getMemoriesByRoomIds: async (params) =>
      runtime.databaseAdapter.getMemoriesByRoomIds({
        ...params,
        tableName,
        agentId: runtime.agentId,
      }),
    searchMemoriesByEmbedding: async (embedding, opts) =>
      runtime.databaseAdapter.searchMemoriesByEmbedding(embedding, { ...opts, tableName }),
    createMemory: async (memory, unique) =>
      runtime.databaseAdapter.createMemory(memory, tableName, unique),
    removeMemory: async (memoryId) => runtime.databaseAdapter.removeMemory(memoryId, tableName),
    removeAllMemories: async (roomId) =>
      runtime.databaseAdapter.removeAllMemories(roomId, tableName),
    countMemories: async (roomId, unique) =>
      runtime.databaseAdapter.countMemories(roomId, unique, tableName),

    // Methods unique to V1 IMemoryManager
    addEmbeddingToMemory: async (memory: V1Memory): Promise<V1Memory> => {
      console.log(
        `[Compat Layer] addEmbeddingToMemory called on V1 manager proxy for table '${tableName}'.`
      );
      // Use our implementation which handles V1->V2->V1 translation
      return runtime.addEmbeddingToMemory(memory);
    },

    getCachedEmbeddings: async (
      content: string
    ): Promise<{ embedding: number[]; levenshtein_score: number }[]> => {
      console.log(
        `[Compat Layer] getCachedEmbeddings called on V1 manager proxy for table '${tableName}'.`
      );
      try {
        // Call the main compat method which calls V2
        return await runtime.databaseAdapter.getCachedEmbeddings({
          query_table_name: tableName,
          query_input: content,
          query_threshold: 2, // Default threshold
          query_field_name: 'content',
          query_field_sub_name: 'text',
          query_match_count: 10, // Default match count
        });
      } catch (e) {
        console.error(
          `[Compat Layer] getCachedEmbeddings failed for table ${tableName}: ${e.message}`
        );
        return [];
      }
    },
  } as unknown as V1IMemoryManager;

  return proxy;
}

/**
 * Adds an embedding to a memory object.
 * This method is used by the V1 MemoryManager's addEmbeddingToMemory method.
 */
export async function addEmbeddingToMemory(
  memory: V1Memory,
  runtime: CompatAgentRuntime
): Promise<V1Memory> {
  console.log(`[Compat Layer] Adding embedding to memory in table: ${memory.roomId}`);

  try {
    // Translate V1 Memory to V2
    const v2Memory = translateV1MemoryToV2(memory);

    // Try to use V2's addEmbeddingToMemory method if it exists and is implemented correctly
    try {
      // Check if the V2 implementation is valid (not returning a deleteComponent by mistake)
      if (
        runtime._v2Runtime.addEmbeddingToMemory &&
        runtime._v2Runtime.addEmbeddingToMemory.toString().indexOf('deleteComponent') === -1
      ) {
        // Use the V2 implementation
        const v2MemoryWithEmbedding = await runtime._v2Runtime.addEmbeddingToMemory(v2Memory);
        return translateV2MemoryToV1(v2MemoryWithEmbedding);
      }
    } catch (e) {
      console.warn(
        `[Compat Layer] V2 addEmbeddingToMemory failed, falling back to manual implementation: ${e.message}`
      );
    }

    // Fallback implementation - use embeddings through model API
    if (!v2Memory.embedding) {
      // Try to get embedding via V2's model API
      try {
        const contentText = v2Memory.content.text || '';
        if (contentText.trim().length > 0) {
          // Use V2's text embedding model
          const embedding = await runtime._v2Runtime.useModel('TEXT_EMBEDDING', {
            text: contentText,
          });

          // Add the embedding to the memory
          v2Memory.embedding = embedding;
        }
      } catch (embedError) {
        console.error('[Compat Layer] Error generating embedding:', embedError);
      }
    }

    // Translate the V2 memory back to V1
    return translateV2MemoryToV1(v2Memory);
  } catch (error) {
    console.error(`[Compat Layer] Error in addEmbeddingToMemory:`, error);
    // Return the original memory without embedding if we encounter an error
    return memory;
  }
}

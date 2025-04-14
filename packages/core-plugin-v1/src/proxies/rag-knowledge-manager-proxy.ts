import {
  IRAGKnowledgeManager,
  RAGKnowledgeItem as V1RAGKnowledgeItem,
  UUID as V1UUID,
} from '../types';
import {
  translateV2MemoryToV1RAG,
  translateV1RAGToV2Knowledge,
} from '../translators/rag-translator';
import { generateUuidFromString } from '../uuid';
import type { CompatAgentRuntime } from '../runtime';
import { Memory as V2Memory, MemoryType } from '@elizaos/core-plugin-v2';

/**
 * Creates a proxy object that implements the V1 IRAGKnowledgeManager interface
 * and translates calls to V2 runtime methods.
 */
export function createRagKnowledgeManagerProxy(runtime: CompatAgentRuntime): IRAGKnowledgeManager {
  const proxy: IRAGKnowledgeManager = {
    runtime,
    tableName: 'knowledge', // V1 manager had tableName property

    /**
     * Gets knowledge items based on a query, ID, or conversation context
     */
    async getKnowledge(params: {
      query?: string;
      id?: V1UUID;
      limit?: number;
      conversationContext?: string;
      agentId?: V1UUID;
    }): Promise<V1RAGKnowledgeItem[]> {
      const v1AgentId = params.agentId || runtime.agentId;

      if (v1AgentId !== runtime.agentId) {
        console.warn(
          `[Compat Layer] RAG getKnowledge called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${runtime.agentId}.`
        );
      }

      try {
        // Handle ID-only lookup if needed
        if (params.id && !params.query && !params.conversationContext) {
          // Use V2's getMemoryById which is more direct than a search
          const v2Memory = await runtime._v2Runtime.getMemoryById(params.id);
          if (!v2Memory) return [];
          return [translateV2MemoryToV1RAG(v2Memory, v1AgentId)];
        }

        // Construct a query context from the available parameters
        const queryText = params.conversationContext
          ? `${params.conversationContext}\n${params.query || ''}`
          : params.query || '';

        if (!queryText) {
          console.warn('[Compat Layer] RAG getKnowledge: No query or context provided.');
          return [];
        }

        // Create a temporary V2 memory object to use as context for V2's knowledge retrieval
        const tempV2Memory: V2Memory = {
          entityId: v1AgentId as any,
          agentId: runtime._v2Runtime.agentId,
          roomId: runtime._v2Runtime.agentId, // Use agent's self-room for context
          content: { text: queryText },
          metadata: {
            type: MemoryType.MESSAGE,
            timestamp: Date.now(),
          },
        };

        // Call V2's getKnowledge method
        const v2KnowledgeItems = await runtime._v2Runtime.getKnowledge(tempV2Memory);

        // Translate results to V1 format
        const v1Items = v2KnowledgeItems.map((item) =>
          translateV2MemoryToV1RAG(item as V2Memory, v1AgentId)
        );

        // Apply limit if provided
        return params.limit ? v1Items.slice(0, params.limit) : v1Items;
      } catch (error) {
        console.error(`[Compat Layer] Error in RAG getKnowledge:`, error);
        throw error;
      }
    },

    /**
     * Creates a new knowledge item in the system
     */
    async createKnowledge(item: V1RAGKnowledgeItem): Promise<void> {
      // Check for agent ID mismatch
      if (item.agentId !== runtime.agentId) {
        console.warn(
          `[Compat Layer] RAG createKnowledge called with mismatched agentId. V1 expected ${item.agentId}, V2 uses ${runtime.agentId}.`
        );
      }

      try {
        // Translate V1 RAGKnowledgeItem to V2 format using our translator
        const v2KnowledgeItem = translateV1RAGToV2Knowledge(item);

        // Use V2's addKnowledge method which handles chunking
        await runtime._v2Runtime.addKnowledge(v2KnowledgeItem, {
          targetTokens: 1500, // Default chunking options
          overlap: 200,
          modelContextSize: 4096,
        });
      } catch (error) {
        console.error(`[Compat Layer] Error in RAG createKnowledge:`, error);

        // Handle potential duplicate errors
        if (error.message?.includes('already exists') || error.code === '23505') {
          console.warn(
            `[Compat Layer] RAG createKnowledge: Item ${item.id} likely already exists.`
          );
          return; // Don't throw if it's just a duplicate
        }

        throw error;
      }
    },

    /**
     * Removes a knowledge item from the system
     */
    async removeKnowledge(id: V1UUID): Promise<void> {
      console.log(`[Compat Layer] RAG removeKnowledge for ID ${id}`);

      try {
        // First delete the main document memory
        await runtime._v2Runtime.deleteMemory(id);

        // Search for any associated fragments and delete them too
        // This is a best-effort approach as V2 might handle this internally
        const v2Fragments = await runtime._v2Runtime.searchMemories({
          tableName: 'knowledge',
          roomId: runtime._v2Runtime.agentId,
          embedding: [], // Empty embedding forces metadata search only
          match_threshold: 0.1, // Low threshold
        });

        // Filter fragments that reference this document ID
        const relatedFragments = v2Fragments.filter(
          (mem) => mem.metadata?.documentId === id || (mem.metadata as any)?.originalId === id
        );

        if (relatedFragments.length > 0) {
          console.log(
            `[Compat Layer] Deleting ${relatedFragments.length} related fragments for document ${id}`
          );

          // Delete each fragment
          await Promise.all(
            relatedFragments.map((frag) => runtime._v2Runtime.deleteMemory(frag.id!))
          );
        }
      } catch (error) {
        console.error(`[Compat Layer] Error in RAG removeKnowledge:`, error);
        throw error;
      }
    },

    /**
     * Searches for knowledge items based on an embedding
     */
    async searchKnowledge(params: {
      agentId: V1UUID;
      embedding: Float32Array | number[];
      match_threshold?: number;
      match_count?: number;
      searchText?: string;
    }): Promise<V1RAGKnowledgeItem[]> {
      if (params.agentId !== runtime.agentId) {
        console.warn(
          `[Compat Layer] RAG searchKnowledge called with mismatched agentId. V1 expected ${params.agentId}, V2 uses ${runtime.agentId}.`
        );
      }

      try {
        // Convert Float32Array to number[] if needed
        const embedding = Array.from(params.embedding);

        // Call V2's searchMemories method
        const v2Memories = await runtime._v2Runtime.searchMemories({
          tableName: 'knowledge', // Target the knowledge fragments table
          roomId: runtime.agentId as any, // Use agent's self-room
          embedding: embedding,
          match_threshold: params.match_threshold,
          count: params.match_count,
        });

        // Translate results to V1 format
        let v1Items = v2Memories.map((mem) => translateV2MemoryToV1RAG(mem, params.agentId));

        // Apply text filtering if provided
        if (params.searchText) {
          const searchText = params.searchText.toLowerCase();
          v1Items = v1Items.filter((item) => item.content.text.toLowerCase().includes(searchText));
        }

        return v1Items;
      } catch (error) {
        console.error(`[Compat Layer] Error in RAG searchKnowledge:`, error);
        throw error;
      }
    },

    /**
     * Clears all knowledge for this agent
     */
    async clearKnowledge(shared?: boolean): Promise<void> {
      if (shared !== undefined) {
        console.warn(
          `[Compat Layer] RAG clearKnowledge shared=${shared} flag has limited support in V2 mapping.`
        );
      }

      const agentRoomId = runtime.agentId;

      try {
        console.log(`[Compat Layer] Clearing knowledge tables for agent ${agentRoomId}`);

        // Clear the documents table
        await runtime._v2Runtime.deleteAllMemories(agentRoomId as any, 'documents');

        // Clear the knowledge fragments table
        await runtime._v2Runtime.deleteAllMemories(agentRoomId as any, 'knowledge');
      } catch (error) {
        console.error(`[Compat Layer] Error in RAG clearKnowledge:`, error);
        throw error;
      }
    },

    /**
     * Processes a file into knowledge chunks
     */
    async processFile(file: {
      path: string;
      content: string;
      type: 'pdf' | 'md' | 'txt';
      isShared: boolean;
    }): Promise<void> {
      console.log(`[Compat Layer] RAG processFile for ${file.path} (${file.type})`);

      try {
        // Generate ID using our scope function
        const id = this.generateScopedId(file.path, file.isShared);

        // Create a V1 knowledge item
        const knowledgeItem: V1RAGKnowledgeItem = {
          id: id,
          agentId: runtime.agentId,
          content: {
            text: file.content,
            metadata: {
              source: file.path,
              type: file.type,
              isShared: file.isShared,
            },
          },
        };

        // Use our createKnowledge method
        await this.createKnowledge(knowledgeItem);
      } catch (error) {
        console.error(`[Compat Layer] Error processing file ${file.path}:`, error);
        throw error;
      }
    },

    /**
     * Cleanup method for deleted knowledge files
     * This is a V1 concept that's not directly needed in V2
     */
    async cleanupDeletedKnowledgeFiles(): Promise<void> {
      console.log(
        '[Compat Layer] RAG cleanupDeletedKnowledgeFiles - This is a no-op in V2 compatibility layer'
      );
      // No operation in V2 compatibility
      return Promise.resolve();
    },

    /**
     * Generates a scoped ID for a knowledge item
     */
    generateScopedId(path: string, isShared: boolean): V1UUID {
      // Replicate V1 ID generation logic
      const scope = isShared ? 'shared' : 'private';
      const scopedPath = `${scope}-${path}`;
      return generateUuidFromString(scopedPath);
    },
  };

  return proxy;
}

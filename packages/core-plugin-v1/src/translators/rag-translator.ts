/**
 * RAG translator module for converting between V1 RAGKnowledgeItem and V2 Memory formats
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import { RAGKnowledgeItem as V1RAGKnowledgeItem, UUID as V1UUID } from '../types';
import {
  KnowledgeItem as V2KnowledgeItem,
  Memory as V2Memory,
  MemoryType,
} from '@elizaos/core-plugin-v2/src/types';

/**
 * Translates a V2 Memory to a V1 RAGKnowledgeItem
 *
 * @param v2Memory The V2 Memory to convert
 * @param agentId The agent ID to use in the V1 item
 * @returns A V1 RAGKnowledgeItem with data from the V2 Memory
 */
export function translateV2MemoryToV1RAG(v2Memory: V2Memory, agentId: V1UUID): V1RAGKnowledgeItem {
  return {
    id: v2Memory.id!,
    agentId: agentId,
    content: {
      text: v2Memory.content.text || '',
      metadata: {
        // Extract relevant metadata from V2
        source: v2Memory.metadata?.source,
        // Add other fields as needed
        ...(v2Memory.metadata || {}),
      },
    },
    embedding: v2Memory.embedding ? new Float32Array(v2Memory.embedding) : undefined,
    createdAt: v2Memory.createdAt || v2Memory.metadata?.timestamp,
    similarity: v2Memory.similarity,
    score: v2Memory.similarity, // V1 might use either field
  };
}

/**
 * Translates a V1 RAGKnowledgeItem to a V2 KnowledgeItem
 *
 * @param v1Item The V1 RAGKnowledgeItem to convert
 * @returns A V2 KnowledgeItem with data from the V1 RAGKnowledgeItem
 */
export function translateV1RAGToV2Knowledge(v1Item: V1RAGKnowledgeItem): V2KnowledgeItem {
  return {
    id: v1Item.id,
    content: {
      text: v1Item.content.text,
      // Preserve any additional content fields
      ...(v1Item.content.metadata || {}),
    },
    metadata: {
      type: MemoryType.DOCUMENT, // Treat as document
      source: v1Item.content.metadata?.source as string | undefined,
      timestamp: v1Item.createdAt || Date.now(),
      // Preserve any additional metadata
      ...(v1Item.content.metadata || {}),
    },
  };
}

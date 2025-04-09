/**
 * Memory translator module for converting between V1 and V2 memory formats
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import type { Memory as V1Memory, UUID as V1UUID } from '../types';

// Import V2 types, using any as a fallback if imports aren't working
type V2Memory = {
  id?: string;
  entityId: string;
  agentId?: string;
  createdAt?: number;
  content: any;
  embedding?: number[];
  roomId: string;
  metadata?: any;
  similarity?: number;
};

/**
 * Converts a V2 Memory object to a V1 Memory object
 * @param v2Memory The V2 Memory to convert
 * @returns A V1-compatible Memory object
 */
export function translateV2MemoryToV1(v2Memory: V2Memory): V1Memory {
  return {
    id: v2Memory.id as V1UUID,
    userId: v2Memory.entityId as V1UUID, // V2 entityId → V1 userId
    agentId: v2Memory.agentId as V1UUID, // May need to handle undefined case
    createdAt: v2Memory.createdAt,
    content: v2Memory.content,
    embedding: v2Memory.embedding,
    roomId: v2Memory.roomId as V1UUID,
    // V2 might store unique flag in metadata
    unique: v2Memory.metadata?.unique ?? false,
    similarity: v2Memory.similarity,
  };
}

/**
 * Converts a V1 Memory object to a V2 Memory object
 * @param v1Memory The V1 Memory to convert
 * @returns A V2-compatible Memory object
 */
export function translateV1MemoryToV2(v1Memory: V1Memory): V2Memory {
  return {
    id: v1Memory.id,
    entityId: v1Memory.userId, // V1 userId → V2 entityId
    agentId: v1Memory.agentId,
    createdAt: v1Memory.createdAt,
    content: v1Memory.content,
    embedding: v1Memory.embedding,
    roomId: v1Memory.roomId,
    // Store V1's unique flag in V2's metadata
    metadata: {
      unique: v1Memory.unique,
      type: 'message', // Default type
    },
    similarity: v1Memory.similarity,
  };
}

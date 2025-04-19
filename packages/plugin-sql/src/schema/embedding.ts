import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, uuid, vector } from 'drizzle-orm/pg-core';
import { VECTOR_DIMS } from '@elizaos/core';
import { memoryTable } from './memory';
import { numberTimestamp } from './types';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { UUID } from '@elizaos/core';

export const DIMENSION_MAP = {
  [VECTOR_DIMS.SMALL]: 'dim384',
  [VECTOR_DIMS.MEDIUM]: 'dim512',
  [VECTOR_DIMS.LARGE]: 'dim768',
  [VECTOR_DIMS.XL]: 'dim1024',
  [VECTOR_DIMS.XXL]: 'dim1536',
  [VECTOR_DIMS.XXXL]: 'dim3072',
} as const;

/**
 * Definition of the embeddings table in the database.
 * Contains columns for ID, Memory ID, Creation Timestamp, and multiple vector dimensions.
 */
export const embeddingTable = pgTable(
  'embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom().notNull(),
    memoryId: uuid('memory_id').references(() => memoryTable.id),
    createdAt: numberTimestamp('created_at')
      .default(sql`now()`)
      .notNull(),
    dim384: vector('dim_384', { dimensions: VECTOR_DIMS.SMALL }),
    dim512: vector('dim_512', { dimensions: VECTOR_DIMS.MEDIUM }),
    dim768: vector('dim_768', { dimensions: VECTOR_DIMS.LARGE }),
    dim1024: vector('dim_1024', { dimensions: VECTOR_DIMS.XL }),
    dim1536: vector('dim_1536', { dimensions: VECTOR_DIMS.XXL }),
    dim3072: vector('dim_3072', { dimensions: VECTOR_DIMS.XXXL }),
  },
  (table) => [
    check('embedding_source_check', sql`"memory_id" IS NOT NULL`),
    index('idx_embedding_memory').on(table.memoryId),
    foreignKey({
      name: 'fk_embedding_memory',
      columns: [table.memoryId],
      foreignColumns: [memoryTable.id],
    }).onDelete('cascade'),
  ]
);

/**
 * Defines the possible values for the Embedding Dimension Column.
 * It can be "dim384", "dim512", "dim768", "dim1024", "dim1536", or "dim3072".
 */
export type EmbeddingDimensionColumn =
  | 'dim384'
  | 'dim512'
  | 'dim768'
  | 'dim1024'
  | 'dim1536'
  | 'dim3072';

/**
 * Retrieve the type of a specific column in the EmbeddingTable based on the EmbeddingDimensionColumn key.
 */
export type EmbeddingTableColumn = (typeof embeddingTable._.columns)[EmbeddingDimensionColumn];

// Inferred database model types from the embedding table schema
export type SelectEmbedding = InferSelectModel<typeof embeddingTable>;
export type InsertEmbedding = InferInsertModel<typeof embeddingTable>;

/**
 * Represents an embedding in the application
 */
export interface Embedding {
  id: UUID;
  memoryId: UUID;
  createdAt: number;
  dim384?: number[];
  dim512?: number[];
  dim768?: number[];
  dim1024?: number[];
  dim1536?: number[];
  dim3072?: number[];
}

/**
 * Maps a database embedding to the application embedding model
 */
export function mapToEmbedding(drizzleEmbedding: SelectEmbedding): Embedding {
  return {
    id: drizzleEmbedding.id as UUID,
    memoryId: drizzleEmbedding.memoryId as UUID,
    createdAt: drizzleEmbedding.createdAt,
    dim384: drizzleEmbedding.dim384 || undefined,
    dim512: drizzleEmbedding.dim512 || undefined,
    dim768: drizzleEmbedding.dim768 || undefined,
    dim1024: drizzleEmbedding.dim1024 || undefined,
    dim1536: drizzleEmbedding.dim1536 || undefined,
    dim3072: drizzleEmbedding.dim3072 || undefined,
  };
}

/**
 * Maps an application embedding to its database representation
 */
export function mapToEmbeddingModel(embedding: Partial<Embedding>): InsertEmbedding {
  const result: Partial<InsertEmbedding> = {};

  if (embedding.id !== undefined) result.id = embedding.id;
  if (embedding.memoryId !== undefined) result.memoryId = embedding.memoryId;
  if (embedding.createdAt !== undefined) result.createdAt = embedding.createdAt;
  if (embedding.dim384 !== undefined) result.dim384 = embedding.dim384;
  if (embedding.dim512 !== undefined) result.dim512 = embedding.dim512;
  if (embedding.dim768 !== undefined) result.dim768 = embedding.dim768;
  if (embedding.dim1024 !== undefined) result.dim1024 = embedding.dim1024;
  if (embedding.dim1536 !== undefined) result.dim1536 = embedding.dim1536;
  if (embedding.dim3072 !== undefined) result.dim3072 = embedding.dim3072;

  return result as InsertEmbedding;
}

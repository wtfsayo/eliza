import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { agentTable } from './agent';
import { numberTimestamp } from './types';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { Entity, UUID } from '@elizaos/core';

/**
 * Represents an entity table in the database.
 * Includes columns for id, agentId, createdAt, names, and metadata.
 */
export const entityTable = pgTable(
  'entities',
  {
    id: uuid('id').notNull().primaryKey(),
    agentId: uuid('agentId')
      .notNull()
      .references(() => agentTable.id, {
        onDelete: 'cascade',
      }),
    createdAt: numberTimestamp('createdAt')
      .default(sql`now()`)
      .notNull(),
    names: text('names')
      .array()
      .default(sql`'{}'::text[]`),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  },
  (table) => [unique('id_agent_id_unique').on(table.id, table.agentId)]
);

// Inferred database model types from the entity table schema
export type DrizzleEntity = InferSelectModel<typeof entityTable>;
export type DrizzleEntityInsert = InferInsertModel<typeof entityTable>;

/**
 * Maps a Drizzle Entity from the database to the Core Entity type
 * @param drizzleEntity The entity data from the database
 * @returns A properly typed Entity object for the core system
 */
export function mapToEntity(drizzleEntity: DrizzleEntity): Entity {
  return {
    id: drizzleEntity.id as UUID,
    names: drizzleEntity.names || [],
    metadata: drizzleEntity.metadata || {},
    agentId: drizzleEntity.agentId as UUID,
  };
}

/**
 * Maps a Core Entity (or partial entity) to a Drizzle database entity for storage
 * @param entity The core entity to map to database format
 * @returns A properly typed object for database operations
 */
export function mapToDrizzleEntity(entity: Partial<Entity>): DrizzleEntityInsert {
  const result: Partial<DrizzleEntityInsert> = {};

  // Only copy properties that exist in the entity
  if (entity.id !== undefined) result.id = entity.id;
  if (entity.names !== undefined) result.names = entity.names;
  if (entity.metadata !== undefined) result.metadata = entity.metadata;
  if (entity.agentId !== undefined) result.agentId = entity.agentId;

  return result as DrizzleEntityInsert;
}

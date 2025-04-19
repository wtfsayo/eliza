import { relations, sql } from 'drizzle-orm';
import { boolean, check, foreignKey, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { Memory, UUID, Content, MemoryMetadata } from '@elizaos/core';
import { agentTable } from './agent';
import { embeddingTable } from './embedding';
import { entityTable } from './entity';
import { roomTable } from './room';
import { worldTable } from './world';
import { numberTimestamp } from './types';

/**
 * Definition of the memory table in the database.
 */
export const memoryTable = pgTable(
  'memories',
  {
    id: uuid('id').primaryKey().notNull(),
    type: text('type').notNull(),
    createdAt: numberTimestamp('createdAt')
      .default(sql`now()`)
      .notNull(),
    content: jsonb('content').$type<Content>().notNull(),
    entityId: uuid('entityId').references(() => entityTable.id, {
      onDelete: 'cascade',
    }),
    agentId: uuid('agentId').references(() => agentTable.id, {
      onDelete: 'cascade',
    }),
    roomId: uuid('roomId').references(() => roomTable.id, {
      onDelete: 'cascade',
    }),
    worldId: uuid('worldId').references(() => worldTable.id, {
      onDelete: 'set null',
    }),
    unique: boolean('unique').default(true).notNull(),
    metadata: jsonb('metadata')
      .$type<MemoryMetadata>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
  },
  (table) => [
    index('idx_memories_type_room').on(table.type, table.roomId),
    index('idx_memories_world_id').on(table.worldId),
    foreignKey({
      name: 'fk_room',
      columns: [table.roomId],
      foreignColumns: [roomTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_user',
      columns: [table.entityId],
      foreignColumns: [entityTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_agent',
      columns: [table.agentId],
      foreignColumns: [agentTable.id],
    }).onDelete('cascade'),
    foreignKey({
      name: 'fk_world',
      columns: [table.worldId],
      foreignColumns: [worldTable.id],
    }).onDelete('set null'),
    index('idx_memories_metadata_type').on(sql`((metadata->>'type'))`),
    index('idx_memories_document_id').on(sql`((metadata->>'documentId'))`),
    index('idx_fragments_order').on(
      sql`((metadata->>'documentId'))`,
      sql`((metadata->>'position'))`
    ),
    check(
      'fragment_metadata_check',
      sql`
            CASE 
                WHEN metadata->>'type' = 'fragment' THEN
                    metadata ? 'documentId' AND 
                    metadata ? 'position'
                ELSE true
            END
        `
    ),
    check(
      'document_metadata_check',
      sql`
            CASE 
                WHEN metadata->>'type' = 'document' THEN
                    metadata ? 'timestamp'
                ELSE true
            END
        `
    ),
  ]
);

// Inferred database model types from the memory table schema
export type SelectMemory = InferSelectModel<typeof memoryTable>;
export type InsertMemory = InferInsertModel<typeof memoryTable>;

export const memoryRelations = relations(memoryTable, ({ one }) => ({
  embedding: one(embeddingTable),
}));

/**
 * Maps a Drizzle memory record to the core Memory type
 */
export function mapToMemory(drizzleMemory: SelectMemory): Memory {
  return {
    id: drizzleMemory.id as UUID,
    entityId: drizzleMemory.entityId as UUID,
    agentId: drizzleMemory.agentId as UUID | undefined,
    roomId: drizzleMemory.roomId as UUID,
    worldId: drizzleMemory.worldId as UUID | undefined,
    createdAt: drizzleMemory.createdAt,
    content: drizzleMemory.content,
    unique: drizzleMemory.unique,
    metadata: drizzleMemory.metadata,
  };
}

/**
 * Maps a core Memory object to a Drizzle memory record for database operations
 */
export function mapToMemoryModel(memory: Partial<Memory>, tableName: string): InsertMemory {
  const result: Partial<InsertMemory> = {};

  // Copy only properties that exist in the memory object
  if (memory.id !== undefined) result.id = memory.id;
  if (memory.createdAt !== undefined) result.createdAt = memory.createdAt;
  if (memory.content !== undefined) result.content = memory.content;
  if (memory.entityId !== undefined) result.entityId = memory.entityId;
  if (memory.agentId !== undefined) result.agentId = memory.agentId;
  if (memory.roomId !== undefined) result.roomId = memory.roomId;
  if (memory.worldId !== undefined) result.worldId = memory.worldId;
  if (memory.unique !== undefined) result.unique = memory.unique;
  if (memory.metadata !== undefined) result.metadata = memory.metadata;

  // Set the memory type based on the table name parameter
  result.type = tableName;

  return result as InsertMemory;
}

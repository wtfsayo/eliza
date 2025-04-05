import { sql } from 'drizzle-orm';
import { foreignKey, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { entityTable } from './entity';
import { roomTable } from './room';
import { numberTimestamp } from './types';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { Log, UUID } from '@elizaos/core';

/**
 * Represents a PostgreSQL table for storing logs.
 *
 * @type {Table}
 */

export const logTable = pgTable(
  'logs',
  {
    id: uuid('id').defaultRandom().notNull(),
    createdAt: numberTimestamp('createdAt')
      .default(sql`now()`)
      .notNull(),
    entityId: uuid('entityId')
      .notNull()
      .references(() => entityTable.id),
    body: jsonb('body').$type<{ [key: string]: unknown }>().notNull(),
    type: text('type').notNull(),
    roomId: uuid('roomId')
      .notNull()
      .references(() => roomTable.id),
  },
  (table) => [
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
  ]
);

// Inferred database model types from the log table schema
export type DrizzleLog = InferSelectModel<typeof logTable>;
export type DrizzleLogInsert = InferInsertModel<typeof logTable>;

// Type mapping utility to convert between Drizzle and Core types
export function mapToLog(drizzleLog: DrizzleLog): Log {
  return {
    id: drizzleLog.id as UUID,
    entityId: drizzleLog.entityId as UUID,
    roomId: drizzleLog.roomId as UUID,
    body: drizzleLog.body,
    type: drizzleLog.type,
    createdAt: new Date(drizzleLog.createdAt),
  };
}

export function mapToDrizzleLog(log: Partial<Log>): DrizzleLogInsert {
  const result: Partial<DrizzleLogInsert> = {};

  if (log.id !== undefined) result.id = log.id;
  if (log.entityId !== undefined) result.entityId = log.entityId;
  if (log.roomId !== undefined) result.roomId = log.roomId;
  if (log.body !== undefined) result.body = log.body;
  if (log.type !== undefined) result.type = log.type;
  if (log.createdAt !== undefined) result.createdAt = log.createdAt.getTime();

  return result as DrizzleLogInsert;
}

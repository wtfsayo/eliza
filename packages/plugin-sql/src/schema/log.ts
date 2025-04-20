import { sql } from 'drizzle-orm';
import { foreignKey, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { entityTable } from './entity';
import { roomTable } from './room';
import { numberTimestamp } from './types';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { Log, UUID } from '@elizaos/core';

/**
 * Definition of a table representing logs in the database.
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
export type SelectLog = InferSelectModel<typeof logTable>;
export type InsertLog = InferInsertModel<typeof logTable>;

/**
 * Maps a database log record to the Core Log type
 * @param logRow The database log record
 * @returns The Core Log type
 */
export function mapToLog(logRow: SelectLog): Log {
  return {
    id: logRow.id as UUID,
    entityId: logRow.entityId as UUID,
    roomId: logRow.roomId as UUID,
    body: logRow.body,
    type: logRow.type,
    createdAt: new Date(logRow.createdAt),
  };
}

/**
 * Maps a Core Log object to a database log record
 * @param log The Core Log object
 * @returns The database log record
 */
export function mapToLogRow(log: Partial<Log>): InsertLog {
  const result: Partial<InsertLog> = {};

  if (log.id !== undefined) result.id = log.id;
  if (log.entityId !== undefined) result.entityId = log.entityId;
  if (log.roomId !== undefined) result.roomId = log.roomId;
  if (log.body !== undefined) result.body = log.body;
  if (log.type !== undefined) result.type = log.type;
  if (log.createdAt !== undefined) result.createdAt = log.createdAt.getTime();

  return result as InsertLog;
}

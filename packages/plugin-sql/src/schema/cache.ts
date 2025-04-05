import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { agentTable } from './agent';
import { numberTimestamp } from './types';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { UUID } from '@elizaos/core';

/**
 * Represents a PostgreSQL table for caching data.
 *
 * @type {pgTable}
 */
export const cacheTable = pgTable(
  'cache',
  {
    id: uuid('id')
      .notNull()
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    key: text('key').notNull(),
    agentId: uuid('agentId')
      .notNull()
      .references(() => agentTable.id, { onDelete: 'cascade' }),
    value: jsonb('value').notNull(),
    createdAt: numberTimestamp('createdAt')
      .default(sql`now()`)
      .notNull(),
    expiresAt: numberTimestamp('expiresAt'),
  },
  (table) => [unique('cache_key_agent_unique').on(table.key, table.agentId)]
);

/**
 * Type definitions for the cache table
 */
export type DrizzleCache = InferSelectModel<typeof cacheTable>;
export type DrizzleCacheInsert = InferInsertModel<typeof cacheTable>;

/**
 * Interface representing a cache entry in the application
 */
export interface Cache<T = any> {
  id: UUID;
  key: string;
  agentId: UUID;
  value: T;
  createdAt: number;
  expiresAt?: number;
}

/**
 * Maps a DrizzleCache object to a Cache object
 */
export function mapToCache(drizzleCache: DrizzleCache): Cache {
  return {
    id: drizzleCache.id as UUID,
    key: drizzleCache.key,
    agentId: drizzleCache.agentId as UUID,
    value: drizzleCache.value,
    createdAt: drizzleCache.createdAt,
    expiresAt: drizzleCache.expiresAt ?? undefined,
  };
}

/**
 * Maps a Cache object to a DrizzleCacheInsert object
 */
export function mapToDrizzleCache(cache: Partial<Cache>): DrizzleCacheInsert {
  const result: Partial<DrizzleCacheInsert> = {};

  if (cache.id !== undefined) result.id = cache.id;
  if (cache.key !== undefined) result.key = cache.key;
  if (cache.agentId !== undefined) result.agentId = cache.agentId;
  if (cache.value !== undefined) result.value = cache.value;
  if (cache.createdAt !== undefined) result.createdAt = cache.createdAt;
  if (cache.expiresAt !== undefined) result.expiresAt = cache.expiresAt;

  return result as DrizzleCacheInsert;
}

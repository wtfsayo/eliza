import type { Agent, UUID, MessageExample } from '@elizaos/core';
import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { numberTimestamp } from './types';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

/**
 * Represents a table for storing agent data.
 *
 * @type {Table}
 */
export const agentTable = pgTable(
  'agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: numberTimestamp('createdAt')
      .default(sql`now()`)
      .notNull(),

    updatedAt: numberTimestamp('updatedAt')
      .default(sql`now()`)
      .notNull(),

    // Character
    name: text('name'),
    username: text('username'),
    system: text('system'),
    bio: jsonb('bio').$type<string | string[]>().notNull(),
    messageExamples: jsonb('message_examples')
      .$type<MessageExample[][]>()
      .default(sql`'[]'::jsonb`),
    postExamples: jsonb('post_examples')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    topics: jsonb('topics')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    adjectives: jsonb('adjectives')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    knowledge: jsonb('knowledge')
      .$type<(string | { path: string; shared?: boolean })[]>()
      .default(sql`'[]'::jsonb`),
    plugins: jsonb('plugins')
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    settings: jsonb('settings')
      .$type<{
        secrets?: { [key: string]: string | boolean | number };
        [key: string]: unknown;
      }>()
      .default(sql`'{}'::jsonb`),
    style: jsonb('style')
      .$type<{
        all?: string[];
        chat?: string[];
        post?: string[];
      }>()
      .default(sql`'{}'::jsonb`),
  },
  (table) => [unique('name_unique').on(table.name)]
);

// Inferred database model types from the agent table schema
export type DrizzleAgent = InferSelectModel<typeof agentTable>;
export type DrizzleAgentInsert = InferInsertModel<typeof agentTable>;

// Type mapping utility to convert between Drizzle and Core types
export function mapToAgent(drizzleAgent: DrizzleAgent): Agent {
  // Explicit mapping of properties ensures type safety
  return {
    id: drizzleAgent.id as UUID, // Cast to ensure UUID type compatibility
    name: drizzleAgent.name || '',
    username: drizzleAgent.username || undefined,
    system: drizzleAgent.system || undefined,
    bio: drizzleAgent.bio,
    messageExamples: drizzleAgent.messageExamples || [],
    postExamples: drizzleAgent.postExamples || [],
    topics: drizzleAgent.topics || [],
    adjectives: drizzleAgent.adjectives || [],
    knowledge: drizzleAgent.knowledge || [],
    plugins: drizzleAgent.plugins || [],
    settings: drizzleAgent.settings || {},
    style: drizzleAgent.style || {},
    enabled: drizzleAgent.enabled,
    createdAt: drizzleAgent.createdAt,
    updatedAt: drizzleAgent.updatedAt,
  };
}

export function mapToDrizzleAgent(agent: Partial<Agent>): DrizzleAgentInsert {
  // Return a properly typed object with only the properties
  // that are defined in the database schema
  const result: Partial<DrizzleAgentInsert> = {};

  // Only copy properties that exist in the agent
  if (agent.id !== undefined) result.id = agent.id;
  if (agent.name !== undefined) result.name = agent.name;
  if (agent.username !== undefined) result.username = agent.username;
  if (agent.system !== undefined) result.system = agent.system;
  if (agent.bio !== undefined) result.bio = agent.bio;
  if (agent.messageExamples !== undefined) result.messageExamples = agent.messageExamples;
  if (agent.postExamples !== undefined) result.postExamples = agent.postExamples;
  if (agent.topics !== undefined) result.topics = agent.topics;
  if (agent.adjectives !== undefined) result.adjectives = agent.adjectives;
  if (agent.knowledge !== undefined) result.knowledge = agent.knowledge;
  if (agent.plugins !== undefined) result.plugins = agent.plugins;
  if (agent.settings !== undefined) result.settings = agent.settings;
  if (agent.style !== undefined) result.style = agent.style;
  if (agent.enabled !== undefined) result.enabled = agent.enabled;
  if (agent.createdAt !== undefined) result.createdAt = agent.createdAt;
  if (agent.updatedAt !== undefined) result.updatedAt = agent.updatedAt;

  return result as DrizzleAgentInsert;
}

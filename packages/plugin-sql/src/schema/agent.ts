import type { Agent, UUID, MessageExample } from '@elizaos/core';
import { sql } from 'drizzle-orm';
import { boolean, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { numberTimestamp } from './types';

/**
 * Represents a table for storing agent data.
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
        [key: string]: any | string | boolean | number;
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

// Using modern type inference with $ prefix
export type AgentModel = typeof agentTable.$inferSelect;
export type AgentInsertModel = typeof agentTable.$inferInsert;

// Type mapping utility to convert between Drizzle and Core types
export function mapToAgent(agentModel: AgentModel): Agent {
  // Explicit mapping of properties ensures type safety
  return {
    id: agentModel.id as UUID, // Cast to ensure UUID type compatibility
    name: agentModel.name || '',
    username: agentModel.username || undefined,
    system: agentModel.system || undefined,
    bio: agentModel.bio,
    messageExamples: agentModel.messageExamples || [],
    postExamples: agentModel.postExamples || [],
    topics: agentModel.topics || [],
    adjectives: agentModel.adjectives || [],
    knowledge: agentModel.knowledge || [],
    plugins: agentModel.plugins || [],
    settings: agentModel.settings || {},
    style: agentModel.style || {},
    enabled: agentModel.enabled,
    createdAt: agentModel.createdAt,
    updatedAt: agentModel.updatedAt,
  };
}

export function mapToAgentModel(agent: Partial<Agent>): AgentInsertModel {
  // Return a properly typed object with only the properties
  // that are defined in the database schema
  const result: Partial<AgentInsertModel> = {};

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

  return result as AgentInsertModel;
}

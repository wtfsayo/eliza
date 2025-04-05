import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { agentTable } from './agent';
import { entityTable } from './entity';
import { roomTable } from './room';
import { numberTimestamp } from './types';
import { worldTable } from './world';
import type { Component, UUID } from '@elizaos/core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';

/**
 * Definition of a table representing components in the database.
 *
 * @type {Table}
 */
export const componentTable = pgTable('components', {
  id: uuid('id').primaryKey().defaultRandom(),
  entityId: uuid('entityId')
    .notNull()
    .references(() => entityTable.id, { onDelete: 'cascade' }),
  agentId: uuid('agentId')
    .notNull()
    .references(() => agentTable.id, { onDelete: 'cascade' }),
  roomId: uuid('roomId')
    .notNull()
    .references(() => roomTable.id, { onDelete: 'cascade' }),
  worldId: uuid('worldId').references(() => worldTable.id, {
    onDelete: 'cascade',
  }),
  sourceEntityId: uuid('sourceEntityId').references(() => entityTable.id, {
    onDelete: 'cascade',
  }),
  type: text('type').notNull(),
  data: jsonb('data').default(sql`'{}'::jsonb`),
  createdAt: numberTimestamp('createdAt')
    .default(sql`now()`)
    .notNull(),
});

// Inferred database model types from the component table schema
export type DrizzleComponent = InferSelectModel<typeof componentTable>;
export type DrizzleComponentInsert = InferInsertModel<typeof componentTable>;

// Type mapping utility to convert between Drizzle and Core types
export function mapToComponent(drizzleComponent: DrizzleComponent): Component {
  // Explicit mapping of properties ensures type safety
  return {
    id: drizzleComponent.id as UUID,
    entityId: drizzleComponent.entityId as UUID,
    agentId: drizzleComponent.agentId as UUID,
    roomId: drizzleComponent.roomId as UUID,
    worldId: drizzleComponent.worldId as UUID,
    sourceEntityId: drizzleComponent.sourceEntityId as UUID,
    type: drizzleComponent.type,
    data: drizzleComponent.data || {},
  };
}

export function mapToDrizzleComponent(component: Partial<Component>): DrizzleComponentInsert {
  // Return a properly typed object with only the properties
  // that are defined in the database schema
  const result: Partial<DrizzleComponentInsert> = {};

  // Only copy properties that exist in the component
  if (component.id !== undefined) result.id = component.id;
  if (component.entityId !== undefined) result.entityId = component.entityId;
  if (component.agentId !== undefined) result.agentId = component.agentId;
  if (component.roomId !== undefined) result.roomId = component.roomId;
  if (component.worldId !== undefined) result.worldId = component.worldId;
  if (component.sourceEntityId !== undefined) result.sourceEntityId = component.sourceEntityId;
  if (component.type !== undefined) result.type = component.type;
  if (component.data !== undefined) result.data = component.data;

  return result as DrizzleComponentInsert;
}

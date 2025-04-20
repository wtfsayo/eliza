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
export type SelectComponent = InferSelectModel<typeof componentTable>;
export type ComponentModelInsert = InferInsertModel<typeof componentTable>;

// Type mapping utility to convert between Drizzle and Core types
export function mapToComponent(componentRow: SelectComponent): Component {
  // Explicit mapping of properties ensures type safety
  return {
    id: componentRow.id as UUID,
    entityId: componentRow.entityId as UUID,
    agentId: componentRow.agentId as UUID,
    roomId: componentRow.roomId as UUID,
    worldId: componentRow.worldId as UUID,
    sourceEntityId: componentRow.sourceEntityId as UUID,
    type: componentRow.type,
    data: componentRow.data || {},
  };
}

export function mapToComponentRow(component: Partial<Component>): ComponentModelInsert {
  // Return a properly typed object with only the properties
  // that are defined in the database schema
  const result: Partial<ComponentModelInsert> = {};

  // Only copy properties that exist in the component
  if (component.id !== undefined) result.id = component.id;
  if (component.entityId !== undefined) result.entityId = component.entityId;
  if (component.agentId !== undefined) result.agentId = component.agentId;
  if (component.roomId !== undefined) result.roomId = component.roomId;
  if (component.worldId !== undefined) result.worldId = component.worldId;
  if (component.sourceEntityId !== undefined) result.sourceEntityId = component.sourceEntityId;
  if (component.type !== undefined) result.type = component.type;
  if (component.data !== undefined) result.data = component.data;

  return result as ComponentModelInsert;
}

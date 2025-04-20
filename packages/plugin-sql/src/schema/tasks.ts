import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { Task, UUID } from '@elizaos/core';

// Define the task metadata type inline since we need specific structure
type TaskMetadata = {
  [key: string]: unknown;
  updateInterval?: number;
  options?: { name: string; description: string }[];
};

/**
 * Represents a table schema for tasks in the database.
 *
 * @type {PgTable}
 */
export const taskTable = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  roomId: uuid('room_id'),
  worldId: uuid('world_id'),
  agentId: uuid('agent_id').notNull(),
  tags: text('tags').array(),
  metadata: jsonb('metadata').$type<TaskMetadata>(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Inferred database model types from the task table schema
export type SelectTask = InferSelectModel<typeof taskTable>;
export type InsertTask = InferInsertModel<typeof taskTable>;

/**
 * Maps a Drizzle task record to the core Task type
 */
export function mapToTask(taskRow: SelectTask): Task {
  return {
    id: taskRow.id as UUID,
    name: taskRow.name,
    description: taskRow.description,
    roomId: taskRow.roomId as UUID | undefined,
    worldId: taskRow.worldId as UUID | undefined,
    tags: taskRow.tags || [],
    metadata: taskRow.metadata || {},
  };
}

/**
 * Maps a core Task object to a Drizzle task record for database operations
 */
export function mapToTaskRow(task: Partial<Task>): InsertTask {
  const result: Partial<InsertTask> = {};

  // Copy only properties that exist in the task object
  if (task.id !== undefined) result.id = task.id;
  if (task.name !== undefined) result.name = task.name;
  if (task.description !== undefined) result.description = task.description;
  if (task.roomId !== undefined) result.roomId = task.roomId;
  if (task.worldId !== undefined) result.worldId = task.worldId;
  if (task.tags !== undefined) result.tags = task.tags;
  if (task.metadata !== undefined) result.metadata = task.metadata as TaskMetadata;

  // For database operations
  if ('agentId' in task) result.agentId = task.agentId as UUID;
  if ('createdAt' in task) result.createdAt = new Date((task as any).createdAt);
  if ('updatedAt' in task) result.updatedAt = new Date((task as any).updatedAt);

  return result as InsertTask;
}

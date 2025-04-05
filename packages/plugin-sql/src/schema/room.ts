import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { agentTable } from './agent';
import { numberTimestamp } from './types';
import { worldTable } from './world';
import { ChannelType, Room as CoreRoom, UUID } from '@elizaos/core';

/**
 * Defines a table schema for 'rooms' in the database.
 *
 * @typedef {object} RoomTable
 * @property {string} id - The unique identifier for the room.
 * @property {string} agentId - The UUID of the agent associated with the room.
 * @property {string} source - The source of the room.
 * @property {string} type - The type of the room.
 * @property {string} serverId - The server ID of the room.
 * @property {string} worldId - The UUID of the world associated with the room.
 * @property {string} name - The name of the room.
 * @property {object} metadata - Additional metadata for the room in JSON format.
 * @property {string} channelId - The channel ID of the room.
 * @property {number} createdAt - The timestamp of when the room was created.
 */
export const roomTable = pgTable('rooms', {
  id: uuid('id')
    .notNull()
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  agentId: uuid('agentId').references(() => agentTable.id, {
    onDelete: 'cascade',
  }),
  source: text('source').notNull(),
  type: text('type').notNull(),
  serverId: text('serverId'),
  worldId: uuid('worldId').references(() => worldTable.id, {
    onDelete: 'cascade',
  }),
  name: text('name'),
  metadata: jsonb('metadata'),
  channelId: text('channelId'),
  createdAt: numberTimestamp('createdAt')
    .default(sql`now()`)
    .notNull(),
});

// Inferred database model types from the room table schema
export type DrizzleRoom = InferSelectModel<typeof roomTable>;
export type DrizzleRoomInsert = InferInsertModel<typeof roomTable>;

// Type mapping utility to convert between Drizzle and Core types
export function mapToRoom(drizzleRoom: DrizzleRoom): CoreRoom {
  return {
    id: drizzleRoom.id as UUID,
    agentId: drizzleRoom.agentId as UUID | undefined,
    source: drizzleRoom.source,
    type: drizzleRoom.type as ChannelType,
    channelId: drizzleRoom.channelId || undefined,
    serverId: drizzleRoom.serverId || undefined,
    worldId: drizzleRoom.worldId as UUID | undefined,
    name: drizzleRoom.name || undefined,
    metadata: drizzleRoom.metadata as Record<string, unknown> | undefined,
  };
}

export function mapToDrizzleRoom(room: Partial<CoreRoom>): DrizzleRoomInsert {
  const result: Partial<DrizzleRoomInsert> = {};

  // Only copy properties that exist in the room
  if (room.id !== undefined) result.id = room.id;
  if (room.name !== undefined) result.name = room.name;
  if (room.agentId !== undefined) result.agentId = room.agentId;
  if (room.source !== undefined) result.source = room.source;
  if (room.type !== undefined) result.type = room.type;
  if (room.channelId !== undefined) result.channelId = room.channelId;
  if (room.serverId !== undefined) result.serverId = room.serverId;
  if (room.worldId !== undefined) result.worldId = room.worldId;
  if (room.metadata !== undefined) result.metadata = room.metadata;

  return result as DrizzleRoomInsert;
}

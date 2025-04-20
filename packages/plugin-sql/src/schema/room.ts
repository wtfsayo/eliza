import { sql } from 'drizzle-orm';
import { jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import { agentTable } from './agent';
import { numberTimestamp } from './types';
import { worldTable } from './world';
import { ChannelType, Room as CoreRoom, UUID } from '@elizaos/core';

/**
 * Defines a table schema for 'rooms' in the database.
 * Rooms represent channels or spaces where entities can participate and interact.
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
  metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
  channelId: text('channelId'),
  createdAt: numberTimestamp('createdAt')
    .default(sql`now()`)
    .notNull(),
});

// Inferred database model types from the room table schema
export type SelectRoom = InferSelectModel<typeof roomTable>;
export type InsertRoom = InferInsertModel<typeof roomTable>;

/**
 * Maps a Drizzle room record to the core Room type
 * @param roomRow The room data from the database
 * @returns A properly typed Room object for the core system
 */
export function mapToRoom(roomRow: SelectRoom): CoreRoom {
  return {
    id: roomRow.id as UUID,
    agentId: roomRow.agentId as UUID | undefined,
    source: roomRow.source,
    type: roomRow.type as ChannelType,
    channelId: roomRow.channelId || undefined,
    serverId: roomRow.serverId || undefined,
    worldId: roomRow.worldId as UUID | undefined,
    name: roomRow.name || undefined,
    metadata: (roomRow.metadata as Record<string, unknown>) || {},
  };
}

/**
 * Maps a Core Room (or partial room) to a Drizzle database room for storage
 * @param room The core room to map to database format
 * @returns A properly typed object for database operations
 */
export function mapToRoomRow(room: Partial<CoreRoom>): InsertRoom {
  const result: Partial<InsertRoom> = {};

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

  return result as InsertRoom;
}

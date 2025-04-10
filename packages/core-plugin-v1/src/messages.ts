import {
  formatMessages as coreFormatMessages,
  formatTimestamp as coreFormatTimestamp,
} from '@elizaos/core-plugin-v2';

import type { IAgentRuntime, Actor, Memory, UUID } from './types.ts';

/**
 * Get details for a list of actors.
 */
export async function getActorDetails({
  runtime,
  roomId,
}: {
  runtime: IAgentRuntime;
  roomId: UUID;
}) {
  // WRITE ME
}

/**
 * Format actors into a string
 * @param actors - list of actors
 * @deprecated
 * @returns string
 */
export function formatActors({ actors }: { actors: Actor[] }) {
  return actors
    .map((actor) => `${actor.name}: ${actor.details?.summary || 'No summary available.'}`)
    .join('\n\n');
}

/**
 * Format messages into a string
 * @param messages - list of messages
 * @param actors - list of actors
 * @returns string
 */
export const formatMessages = ({ messages, actors }: { messages: Memory[]; actors: Actor[] }) => {
  return coreFormatMessages(messages, actors);
};

export const formatTimestamp = (messageDate: number) => {
  return coreFormatTimestamp(messageDate);
};

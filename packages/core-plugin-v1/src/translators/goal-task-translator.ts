/**
 * Goal-task translator module for converting between V1 Goals and V2 Tasks
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import {
  Goal as V1Goal,
  GoalStatus as V1GoalStatus,
  Objective as V1Objective,
  UUID as V1UUID,
} from '../types';
import { Task, UUID } from '@elizaos/core-plugin-v2/src/types';

/**
 * Translates a V1 Goal to a V2 Task
 * @param goal The V1 Goal to translate
 * @returns A V2 Task with V1 Goal data stored in metadata
 */
export function translateV1GoalToV2Task(goal: V1Goal): Task {
  // Extract goal description from objectives if it doesn't have its own
  const description =
    'description' in goal
      ? goal.description
      : goal.objectives
        ? goal.objectives.map((o) => o.description).join('; ')
        : 'V1 Goal';

  return {
    id: goal.id as UUID,
    name: goal.name,
    description: description as string,
    roomId: goal.roomId as UUID,
    tags: ['v1_goal_compat'], // Tag for identification
    metadata: {
      v1_compat: true, // Mark as a compatibility task
      v1_userId: goal.userId,
      v1_status: goal.status,
      v1_objectives: goal.objectives,
      v1_createdAt: 'createdAt' in goal ? goal.createdAt : undefined,
      // Store other V1 fields as needed
    },
  };
}

/**
 * Translates a V2 Task to a V1 Goal if the task was created from a V1 goal
 * @param task The V2 Task to translate
 * @returns A V1 Goal or null if task is not compatible
 */
export function translateV2TaskToV1Goal(task: Task): V1Goal | null {
  // Check if this task originated from a V1 goal
  if (!task.metadata?.v1_compat) {
    console.warn(
      `[Compat Layer] Attempted to translate non-V1 compatible Task (ID: ${task.id}) to V1 Goal. Skipping.`
    );
    return null;
  }

  // Extract V1 data from metadata
  const userId = task.metadata.v1_userId as V1UUID;
  const status = task.metadata.v1_status as V1GoalStatus;
  const objectives = task.metadata.v1_objectives as V1Objective[];

  if (!userId || !status || !objectives) {
    console.error(
      `[Compat Layer] V1 compatibility metadata missing in Task (ID: ${task.id}). Cannot translate to V1 Goal.`
    );
    return null;
  }

  // Create a V1 Goal with only the fields that exist in the interface
  const v1Goal: V1Goal = {
    id: task.id as V1UUID,
    name: task.name,
    roomId: task.roomId as V1UUID,
    userId: userId,
    status: status,
    objectives: objectives,
  };

  // Add createdAt if available in metadata
  if (
    typeof task.metadata === 'object' &&
    task.metadata !== null &&
    'v1_createdAt' in task.metadata
  ) {
    const createdAt = task.metadata['v1_createdAt'];
    if (createdAt !== undefined && createdAt !== null) {
      (v1Goal as any).createdAt = Number(String(createdAt));
    }
  }

  return v1Goal;
}

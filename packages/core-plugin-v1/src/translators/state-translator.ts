/**
 * State translator module for converting between V1 and V2 state formats
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import { State as V1State, Action as V1Action } from '../types';
import { State as V2State, Action as V2Action } from '@elizaos/core-plugin-v2';
import {
  translateV1ActionExampleToV2,
  translateV2ActionExampleToV1,
} from './action-example-translator';

/**
 * Default empty state with required properties
 */
const DEFAULT_STATE: Partial<V1State> = {
  bio: '',
  lore: '',
  messageDirections: '',
  postDirections: '',
  actors: '',
  recentMessages: '',
  recentMessagesData: [],
  actionNames: '',
  actions: '',
  actionsData: [],
  actionExamples: '',
  providers: '',
  characterPostExamples: '',
  characterMessageExamples: '',
  evaluators: '',
  evaluatorNames: '',
  evaluatorExamples: '',
  knowledge: '',
  knowledgeData: [],
  ragKnowledgeData: [],
  goals: '',
  goalsData: [],
  recentPosts: '',
  recentInteractionsData: [],
  recentMessageInteractions: '',
  recentPostInteractions: '',
  attachments: '',
  adjective: '',
  topic: '',
  topics: '',
};

/**
 * Converts a V2 State to a V1 State
 * @param stateV2 The V2 State to convert
 * @returns A V1-compatible State object
 */
export function translateV2StateToV1(stateV2: V2State): V1State {
  // Create a new state object starting with default values
  const state: V1State = {
    ...DEFAULT_STATE,
    ...stateV2.values,
    ...stateV2.data,
    text: stateV2.text,
  };

  // Special handling for arrays and objects to ensure they're properly copied
  if (stateV2.data?.recentMessagesData) {
    state.recentMessagesData = Array.isArray(stateV2.data.recentMessagesData)
      ? [...stateV2.data.recentMessagesData]
      : [];
  }

  if (stateV2.data?.actorsData) {
    state.actorsData = Array.isArray(stateV2.data.actorsData) ? [...stateV2.data.actorsData] : [];
  }

  if (stateV2.data?.goalsData) {
    state.goalsData = Array.isArray(stateV2.data.goalsData) ? [...stateV2.data.goalsData] : [];
  }

  if (stateV2.data?.knowledgeData) {
    state.knowledgeData = Array.isArray(stateV2.data.knowledgeData)
      ? [...stateV2.data.knowledgeData]
      : [];
  }

  if (stateV2.data?.ragKnowledgeData) {
    state.ragKnowledgeData = Array.isArray(stateV2.data.ragKnowledgeData)
      ? [...stateV2.data.ragKnowledgeData]
      : [];
  }

  if (stateV2.data?.actionsData) {
    state.actionsData = Array.isArray(stateV2.data.actionsData)
      ? stateV2.data.actionsData.map((action: V2Action) => {
          // Transform action examples to V1 format if they exist
          if (action.examples) {
            return {
              ...action,
              examples: action.examples.map((exampleGroup) =>
                exampleGroup.map((example) => translateV2ActionExampleToV1(example))
              ),
            } as V1Action;
          }
          return action as unknown as V1Action;
        })
      : [];
  }

  if (stateV2.data?.recentInteractionsData) {
    state.recentInteractionsData = Array.isArray(stateV2.data.recentInteractionsData)
      ? [...stateV2.data.recentInteractionsData]
      : [];
  }

  // Handle character-related fields that might be in values
  const characterFields = [
    'bio',
    'lore',
    'adjective',
    'topic',
    'topics',
    'messageDirections',
    'postDirections',
    'characterPostExamples',
    'characterMessageExamples',
  ];

  for (const field of characterFields) {
    if (stateV2.values[field] !== undefined) {
      state[field] = stateV2.values[field];
    }
  }

  // Add any other properties from the v2 state
  for (const key in stateV2) {
    if (key !== 'values' && key !== 'data' && key !== 'text') {
      state[key] = stateV2[key];
    }
  }

  return state;
}

/**
 * Converts a V1 State to a V2 State
 * @param stateV1 The V1 State to convert
 * @returns A V2-compatible State object
 */
export function translateV1StateToV2(stateV1: V1State): V2State {
  // Create a base v2 state structure
  const stateV2: V2State = {
    values: {},
    data: {},
    text: stateV1.text || '',
  };

  // Map primitive values to values object
  const primitiveFields = [
    'bio',
    'lore',
    'messageDirections',
    'postDirections',
    'actors',
    'recentMessages',
    'actionNames',
    'actions',
    'actionExamples',
    'providers',
    'characterPostExamples',
    'characterMessageExamples',
    'evaluators',
    'evaluatorNames',
    'evaluatorExamples',
    'knowledge',
    'goals',
    'recentPosts',
    'recentMessageInteractions',
    'recentPostInteractions',
    'attachments',
    'agentId',
    'userId',
    'roomId',
    'agentName',
    'senderName',
    'adjective',
    'topic',
    'topics',
  ];

  // Map complex data to data object
  const dataFields = [
    'recentMessagesData',
    'actorsData',
    'goalsData',
    'knowledgeData',
    'ragKnowledgeData',
    'actionsData',
    'recentInteractionsData',
    'evaluatorsData',
  ];

  // Process primitive values
  for (const field of primitiveFields) {
    if (field in stateV1 && stateV1[field] !== undefined) {
      stateV2.values[field] = stateV1[field];
    }
  }

  // Process data objects
  for (const field of dataFields) {
    if (field in stateV1 && stateV1[field] !== undefined) {
      if (field === 'actionsData' && Array.isArray(stateV1[field])) {
        // Handle actionsData transformation
        stateV2.data[field] = stateV1[field].map((action: V1Action) => {
          // Transform action examples to V2 format if they exist
          if (action.examples) {
            return {
              ...action,
              examples: action.examples.map((exampleGroup) =>
                exampleGroup.map((example) => translateV1ActionExampleToV2(example))
              ),
            } as V2Action;
          }
          return action as unknown as V2Action;
        });
      } else {
        stateV2.data[field] = Array.isArray(stateV1[field]) ? [...stateV1[field]] : stateV1[field];
      }
    }
  }

  // Add any other properties from v1 state as-is to preserve them
  for (const key in stateV1) {
    if (
      !primitiveFields.includes(key) &&
      !dataFields.includes(key) &&
      key !== 'text' &&
      !key.startsWith('_')
    ) {
      stateV2[key] = stateV1[key];
    }
  }

  return stateV2;
}

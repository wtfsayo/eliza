import { UUID, State as StateFromTypes } from './types';
import { State as StateV2 } from '@elizaos/core-plugin-v2';

/**
 * Represents the state of a conversation or context
 * This is a v1 compatibility wrapper for v2 State
 */
export type State = StateFromTypes;

/**
 * Default empty state with required properties
 */
const DEFAULT_STATE: Partial<State> = {
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
};

/**
 * Converts v2 State to v1 compatible State
 * Uses the V2 State interface from core-plugin-v2
 */
export function fromV2State(stateV2: StateV2): State {
  // Create a new state object starting with default values
  const state: State = {
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
      ? [...stateV2.data.actionsData]
      : [];
  }

  if (stateV2.data?.recentInteractionsData) {
    state.recentInteractionsData = Array.isArray(stateV2.data.recentInteractionsData)
      ? [...stateV2.data.recentInteractionsData]
      : [];
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
 * Converts v1 State to v2 State
 * Creates a state object conforming to V2 State interface
 */
export function toV2State(state: State): StateV2 {
  // Create a base v2 state structure
  const stateV2: StateV2 = {
    values: {},
    data: {},
    text: state.text || '',
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
  ];

  // Process primitive values
  for (const field of primitiveFields) {
    if (field in state && state[field] !== undefined) {
      stateV2.values[field] = state[field];
    }
  }

  // Process data objects
  for (const field of dataFields) {
    if (field in state && state[field] !== undefined) {
      stateV2.data[field] = Array.isArray(state[field]) ? [...state[field]] : state[field];
    }
  }

  // Add any other properties from v1 state as-is to preserve them
  for (const key in state) {
    if (
      !primitiveFields.includes(key) &&
      !dataFields.includes(key) &&
      key !== 'text' &&
      !key.startsWith('_')
    ) {
      stateV2[key] = state[key];
    }
  }

  return stateV2;
}

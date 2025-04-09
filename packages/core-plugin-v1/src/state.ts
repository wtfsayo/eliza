import { UUID, State as StateFromTypes } from './types';

// Define equivalent to StateV2 here to avoid external dependencies
interface StateV2 {
  values: { [key: string]: any };
  data: { [key: string]: any };
  text: string;
  [key: string]: any;
}

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
};

/**
 * Converts v2 State to v1 compatible State
 */
export function fromV2State(stateV2: StateV2): State {
  // Create a new state object starting with default values
  const state: State = {
    ...DEFAULT_STATE,
    ...stateV2.values,
    ...stateV2.data,
    text: stateV2.text,
  };

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
 */
export function toV2State(state: State): StateV2 {
  // Create a base v2 state structure
  const stateV2: StateV2 = {
    values: {},
    data: {},
    text: state.text || '',
  };

  // Add any properties from v1 state as-is to preserve them
  for (const key in state) {
    if (key !== 'text') {
      stateV2[key] = state[key];
    }
  }

  return stateV2;
}

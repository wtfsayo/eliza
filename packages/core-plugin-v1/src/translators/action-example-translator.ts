/**
 * Action Example translator module for converting between V1 and V2 action example formats
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import { Content as V1Content, ActionExample as V1ActionExample } from '../types';
import { ActionExample as V2ActionExample, Content as V2Content } from '@elizaos/core-plugin-v2';

/**
 * Converts a V2 Content object to a V1 Content
 * @param contentV2 The V2 Content to convert
 * @returns A V1-compatible Content object
 */
export function translateV2ContentToV1(contentV2: V2Content): V1Content {
  if (!contentV2) {
    return { text: '' } as V1Content;
  }

  return {
    text: contentV2.text || '',
    // V2 uses 'actions' array, V1 might use 'action' string
    action:
      Array.isArray(contentV2.actions) && contentV2.actions.length > 0
        ? contentV2.actions[0]
        : undefined,
    // Copy all other properties
    ...Object.entries(contentV2)
      .filter(([key]) => !['text', 'actions', 'action'].includes(key))
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
  } as V1Content;
}

/**
 * Converts a V1 Content object to a V2 Content
 * @param contentV1 The V1 Content to convert
 * @returns A V2-compatible Content object
 */
export function translateV1ContentToV2(contentV1: V1Content): V2Content {
  if (!contentV1) {
    return { text: '' } as V2Content;
  }

  return {
    text: contentV1.text || '',
    // V1 uses 'action' string, V2 uses 'actions' array
    actions: contentV1.action ? [contentV1.action] : [],
    // Copy all other properties
    ...Object.entries(contentV1)
      .filter(([key]) => !['text', 'action'].includes(key))
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
  } as V2Content;
}

/**
 * Converts a V2 ActionExample to a V1 ActionExample
 * @param actionExampleV2 The V2 ActionExample to convert
 * @returns A V1-compatible ActionExample object
 */
export function translateV2ActionExampleToV1(actionExampleV2: V2ActionExample): V1ActionExample {
  if (!actionExampleV2) {
    return { user: '', content: { text: '' } as V1Content };
  }

  // The main difference is that v2 uses 'name' instead of 'user'
  return {
    user: actionExampleV2.name || '',
    content: translateV2ContentToV1(actionExampleV2.content),
  };
}

/**
 * Converts a V1 ActionExample to a V2 ActionExample
 * @param actionExampleV1 The V1 ActionExample to convert
 * @returns A V2-compatible ActionExample object
 */
export function translateV1ActionExampleToV2(actionExampleV1: V1ActionExample): V2ActionExample {
  if (!actionExampleV1) {
    return { name: '', content: { text: '' } as V2Content };
  }

  // Convert v1 format to v2 format
  return {
    name: actionExampleV1.user || '',
    content: translateV1ContentToV2(actionExampleV1.content),
  };
}

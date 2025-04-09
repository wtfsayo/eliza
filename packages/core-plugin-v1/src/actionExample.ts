import { Content, ActionExample as ActionExampleFromTypes } from './types';

/**
 * Common content interface that's compatible with both V1 and V2 content types
 * This provides a safer type boundary between the two versions
 */
export interface CommonContent {
  text: string;
  actions?: string[];
  [key: string]: unknown;
}

/**
 * Define equivalent of ActionExampleV2 here to avoid external dependencies
 * This provides the expected shape of V2 examples
 */
export interface ActionExampleV2 {
  /** User associated with the example */
  name: string;

  /** Content of the example */
  content: CommonContent;
}

/**
 * Example content with associated user for demonstration purposes
 * This is exported from types.ts in v1, but we're recreating it here for the adapter
 */
export type ActionExample = ActionExampleFromTypes;

/**
 * Safely converts a V2 content object to a V1 Content type
 * Maps known properties and preserves additional ones
 *
 * @param content V2 content object
 * @returns Content compatible with V1
 */
export function convertContentToV1(content: CommonContent): Content {
  if (!content) {
    return { text: '' } as Content;
  }

  return {
    text: content.text || '',
    actions: Array.isArray(content.actions) ? [...content.actions] : [],
    // Copy all other properties
    ...Object.entries(content)
      .filter(([key]) => !['text', 'actions'].includes(key))
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
  } as Content;
}

/**
 * Safely converts a V1 Content object to a V2 compatible content type
 * Maps known properties and preserves additional ones
 *
 * @param content V1 Content object
 * @returns Content compatible with V2
 */
export function convertContentToV2(content: Content): CommonContent {
  if (!content) {
    return { text: '' };
  }

  return {
    text: content.text || '',
    actions: Array.isArray(content.actions) ? [...content.actions] : [],
    // Copy all other properties
    ...Object.entries(content)
      .filter(([key]) => !['text', 'actions'].includes(key))
      .reduce((obj, [key, value]) => ({ ...obj, [key]: value }), {}),
  };
}

/**
 * Converts v2 ActionExample to v1 compatible ActionExample
 *
 * @param exampleV2 The V2 action example to convert
 * @returns V1 compatible ActionExample
 */
export function fromV2ActionExample(exampleV2: ActionExampleV2): ActionExample {
  if (!exampleV2) {
    return { user: '', content: { text: '' } as Content };
  }

  // The main difference is that v2 uses 'name' instead of 'user'
  return {
    user: exampleV2.name || '',
    content: convertContentToV1(exampleV2.content),
  };
}

/**
 * Converts v1 ActionExample to v2 ActionExample
 *
 * @param example The V1 action example to convert
 * @returns V2 compatible ActionExample
 */
export function toV2ActionExample(example: ActionExample): ActionExampleV2 {
  if (!example) {
    return { name: '', content: { text: '' } };
  }

  // Convert v1 format to v2 format
  return {
    name: example.user || '',
    content: convertContentToV2(example.content),
  };
}

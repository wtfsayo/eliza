import { Content as V1Content, UUID as V1UUID } from '../types';
import { Content as V2Content, UUID as V2UUID } from '@elizaos/core-plugin-v2';

/**
 * Translates v1 Content to v2 Content format
 */
export function translateV1ContentToV2(v1Content: V1Content): V2Content {
  if (!v1Content) return null;

  // Create the base v2 content object
  const v2Content: V2Content = {
    // Copy text (always present in v1)
    text: v1Content.text,

    // Map v1's single action to v2's actions array if it exists
    actions: v1Content.action ? [v1Content.action] : undefined,

    // Copy common properties
    source: v1Content.source,
    url: v1Content.url,
    inReplyTo: v1Content.inReplyTo as V2UUID,
    attachments: v1Content.attachments,

    // Default v2-specific properties to undefined
    thought: undefined,
    providers: undefined,
  };

  // Copy any additional custom properties
  for (const key in v1Content) {
    // Skip properties we've already explicitly handled
    if (['text', 'action', 'source', 'url', 'inReplyTo', 'attachments'].includes(key)) {
      continue;
    }

    // Copy additional properties
    v2Content[key] = v1Content[key];
  }

  return v2Content;
}

/**
 * Translates v2 Content to v1 Content format
 */
export function translateV2ContentToV1(v2Content: V2Content): V1Content {
  if (!v2Content) return null;

  // Create the base v1 content object
  const v1Content: V1Content = {
    // v1 requires text, use empty string as fallback if not present
    text: v2Content.text || '',

    // Map v2's actions array to v1's single action if present
    action: v2Content.actions?.length ? v2Content.actions[0] : undefined,

    // Copy common properties
    source: v2Content.source,
    url: v2Content.url,
    inReplyTo: v2Content.inReplyTo as V1UUID,
    attachments: v2Content.attachments,
  };

  // If v2 has thought, we might want to include it in v1's text or as a custom property
  if (v2Content.thought) {
    v1Content['thought'] = v2Content.thought;
  }

  // Copy any additional custom properties
  for (const key in v2Content) {
    // Skip properties we've already explicitly handled
    if (
      [
        'text',
        'actions',
        'source',
        'url',
        'inReplyTo',
        'attachments',
        'thought',
        'providers',
      ].includes(key)
    ) {
      continue;
    }

    // Copy additional properties
    v1Content[key] = v2Content[key];
  }

  return v1Content;
}

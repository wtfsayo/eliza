import { type Plugin as V1Plugin } from '../types';
import { type Plugin as V2Plugin } from '@elizaos/core-plugin-v2';
import { wrapV1Action } from './action';
import { wrapV1Provider } from './provider';
import { wrapV1Evaluator } from './evaluator';
// import { wrapV1Service } from './service-wrapper';

/**
 * Detects if a plugin is a v1 plugin based on its structure
 */
export function isV1Plugin(plugin: any): boolean {
  if (!plugin || typeof plugin !== 'object') return false;

  // Check for characteristic v1 plugin structures
  if (Array.isArray(plugin.actions) && plugin.actions.some((action) => 'similes' in action)) {
    return true;
  }

  // V1 plugins typically don't have an init method
  if (Array.isArray(plugin.actions) && !('init' in plugin)) {
    return true;
  }

  // Check for v1-specific fields
  if ('clients' in plugin || 'adapters' in plugin) {
    return true;
  }

  // Default to false if no v1 characteristics detected
  return false;
}

/**
 * Wraps a v1 plugin to make it compatible with the v2 runtime
 */
export function wrapV1Plugin(v1Plugin: V1Plugin): V2Plugin {
  console.log(`[Compat Layer] Wrapping v1 plugin: ${v1Plugin.name}`);

  return {
    name: v1Plugin.name,
    description: v1Plugin.description || 'V1 plugin wrapped for v2 compatibility',

    // Wrap actions if present
    actions: v1Plugin.actions?.map(wrapV1Action) || [],

    // Wrap providers if present
    providers: v1Plugin.providers?.map(wrapV1Provider) || [],

    // Wrap evaluators if present
    evaluators: v1Plugin.evaluators?.map(wrapV1Evaluator) || [],

    // In v2, services are different, we need a special adapter
    // TODO: Implement this
    // services: v1Plugin.services?.map(wrapV1Service) || [],

    // Any additional v2 properties that need defaults or mappings
    config: v1Plugin.config || {},

    // V1 doesn't have init, but v2 needs it - create an empty init
    init: async (config: Record<string, string>, runtime: any) => {
      console.log(`[Compat Layer] Initializing wrapped v1 plugin: ${v1Plugin.name}`);
      // Nothing to do for v1 plugins without init
      return undefined;
    },
  };
}

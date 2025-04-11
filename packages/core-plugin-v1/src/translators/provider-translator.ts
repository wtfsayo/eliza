/**
 * Provider translator module for converting between V1 and V2 provider formats
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import {
  Provider as V1Provider,
  IAgentRuntime as V1IAgentRuntime,
  Memory as V1Memory,
  State as V1State,
} from '../types';
import {
  Provider as V2Provider,
  ProviderResult as V2ProviderResult,
  IAgentRuntime as V2IAgentRuntime,
} from '@elizaos/core-plugin-v2';
import { translateV2MemoryToV1, translateV1MemoryToV2 } from './memory-translator';
import { translateV2StateToV1, translateV1StateToV2 } from './state-translator';
import { CompatAgentRuntime } from '../runtime';

/**
 * Converts a V1 Provider to a V2 Provider
 * @param providerV1 The V1 Provider to convert
 * @returns A V2-compatible Provider object
 */
export function translateV1ProviderToV2(providerV1: V1Provider): V2Provider {
  return {
    name: providerV1.name || 'unnamed-provider',
    description: providerV1.description,
    dynamic: providerV1.dynamic,
    position: providerV1.position,
    private: providerV1.private,
    get: async (
      runtimeV2: V2IAgentRuntime,
      messageV2: any,
      stateV2: any
    ): Promise<V2ProviderResult> => {
      try {
        // Create a compat runtime to use with V1 provider
        const compatRuntime = new CompatAgentRuntime(runtimeV2);

        // Translate V2 message to V1 format
        const messageV1 = translateV2MemoryToV1(messageV2);

        // Translate V2 state to V1 format if provided
        const stateV1 = stateV2 ? translateV2StateToV1(stateV2) : undefined;

        // Call the V1 provider with compatible types
        const resultV1 = await providerV1.get(compatRuntime, messageV1, stateV1);

        // Format the result according to V2 ProviderResult
        if (typeof resultV1 === 'object' && resultV1 !== null) {
          // For objects, preserve all properties for full compatibility
          return {
            ...resultV1,
            values: resultV1.values || {},
            data: resultV1.data || {},
            text: resultV1.text || '',
          };
        }

        // For primitive results (typically strings), return as text
        return {
          values: {},
          data: {},
          text: String(resultV1 || ''),
        };
      } catch (error) {
        console.error(`Error in V1 provider ${providerV1.name || 'unnamed'}:`, error);
        throw error;
      }
    },
  };
}

/**
 * Converts a V2 Provider to a V1 Provider
 * @param providerV2 The V2 Provider to convert
 * @returns A V1-compatible Provider object
 */
export function translateV2ProviderToV1(providerV2: V2Provider): V1Provider {
  return {
    name: providerV2.name,
    description: providerV2.description,
    dynamic: providerV2.dynamic,
    position: providerV2.position,
    private: providerV2.private,
    get: async (runtimeV1: V1IAgentRuntime, messageV1: V1Memory, stateV1?: V1State) => {
      try {
        // Translate V1 message to V2 format
        const messageV2 = translateV1MemoryToV2(messageV1);

        // Translate V1 state to V2 format if provided
        const stateV2 = stateV1 ? translateV1StateToV2(stateV1) : undefined;

        // Call the V2 provider
        const resultV2 = await providerV2.get(runtimeV1 as any, messageV2 as any, stateV2 as any);

        // Extract text or use an empty string if not present
        return resultV2.text || '';
      } catch (error) {
        console.error(`Error in V2 provider ${providerV2.name}:`, error);
        throw error;
      }
    },
  };
}

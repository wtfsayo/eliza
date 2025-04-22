import {
  type Provider as V1Provider,
  type Memory as V1Memory,
  type State as V1State,
} from '../types';
import {
  type Provider as V2Provider,
  type Memory as V2Memory,
  type State as V2State,
} from '@elizaos/core-plugin-v2';
import { CompatAgentRuntime } from '../runtime';
import { translateV2MemoryToV1 } from '../translators/memory-translator';
import { translateV2StateToV1 } from '../translators/state-translator';
import { translateV2ProviderToV1 } from '../translators/provider-translator';

// Cache for CompatAgentRuntime instances to prevent creating multiple per v2Runtime
const runtimeCache = new WeakMap<any, CompatAgentRuntime>();

/**
 * Gets or creates a CompatAgentRuntime for the given v2 runtime
 */
function getCompatRuntime(v2Runtime: any): CompatAgentRuntime {
  if (!runtimeCache.has(v2Runtime)) {
    runtimeCache.set(v2Runtime, new CompatAgentRuntime(v2Runtime));
  }
  return runtimeCache.get(v2Runtime);
}

/**
 * Wraps a v1 provider to make it compatible with the v2 runtime
 */
export function wrapV1Provider(v1Provider: V1Provider): V2Provider {
  if (!v1Provider) return null;

  console.log(`[Compat Layer] Wrapping v1 provider: ${v1Provider.name || 'unnamed'}`);

  return {
    name: v1Provider.name || 'v1-wrapped-provider',
    description: v1Provider.description || 'V1 provider wrapped for v2 compatibility',

    // Copy over provider properties
    dynamic: v1Provider.dynamic || false,
    position: v1Provider.position || 0,
    private: v1Provider.private || false,

    // Wrap the get function
    get: async (v2Runtime: any, v2Message: V2Memory, v2State: V2State) => {
      try {
        console.log(`[Compat Layer] Executing v1 provider: ${v1Provider.name || 'unnamed'}`);
        // Get the compatibility runtime
        const compatRuntime = getCompatRuntime(v2Runtime);

        // Convert v2 memory to v1
        const v1Memory = translateV2MemoryToV1(v2Message);

        // Convert v2 state to v1
        const v1State = translateV2StateToV1(v2State);

        // Call the original v1 provider's get function
        const v1Result = await v1Provider.get(compatRuntime, v1Memory, v1State);

        // Convert v1 provider result to v2 format
        return translateV2ProviderToV1(v1Result);
      } catch (error) {
        console.error(`[Compat Layer] Error in v1 provider:`, error);
        // Return empty result on error
        return { values: {}, text: '', data: {} };
      }
    },
  };
}

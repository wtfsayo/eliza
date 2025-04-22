import {
  type Evaluator as V1Evaluator,
  type HandlerCallback as V1HandlerCallback,
  type Memory as V1Memory,
  type State as V1State,
} from '../types';
import {
  type Evaluator as V2Evaluator,
  type HandlerCallback as V2HandlerCallback,
  type Memory as V2Memory,
  type State as V2State,
} from '@elizaos/core-plugin-v2';
import { CompatAgentRuntime } from '../runtime';
import { translateV2MemoryToV1 } from '../translators/memory-translator';
import { translateV2StateToV1 } from '../translators/state-translator';
import { translateV1ContentToV2 } from '../translators/content-translator';

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
 * Wraps a v1 evaluator to make it compatible with the v2 runtime
 */
export function wrapV1Evaluator(v1Evaluator: V1Evaluator): V2Evaluator {
  if (!v1Evaluator) return null;

  console.log(`[Compat Layer] Wrapping v1 evaluator: ${v1Evaluator.name}`);

  return {
    name: v1Evaluator.name,
    description: v1Evaluator.description,
    alwaysRun: v1Evaluator.alwaysRun || false,

    // Wrap the validate function
    validate: async (v2Runtime: any, v2Message: V2Memory, v2State?: V2State): Promise<boolean> => {
      try {
        console.log(`[Compat Layer] Validating v1 evaluator: ${v1Evaluator.name}`);
        // Get the compatibility runtime
        const compatRuntime = getCompatRuntime(v2Runtime);

        // Convert v2 memory to v1
        const v1Memory = translateV2MemoryToV1(v2Message);

        // Convert v2 state to v1 if it exists
        const v1State = v2State ? translateV2StateToV1(v2State) : undefined;

        // Call the original v1 validate function
        return await v1Evaluator.validate(compatRuntime, v1Memory, v1State);
      } catch (error) {
        console.error(`[Compat Layer] Error in v1 evaluator validation:`, error);
        return false;
      }
    },

    // Wrap the handler function
    handler: async (
      v2Runtime: any,
      v2Message: V2Memory,
      v2State?: V2State,
      options?: { [key: string]: unknown },
      v2Callback?: V2HandlerCallback,
      v2Responses?: V2Memory[]
    ): Promise<unknown> => {
      try {
        console.log(`[Compat Layer] Executing v1 evaluator handler: ${v1Evaluator.name}`);
        // Get the compatibility runtime
        const compatRuntime = getCompatRuntime(v2Runtime);

        // Convert v2 memory to v1
        const v1Memory = translateV2MemoryToV1(v2Message);

        // Convert v2 state to v1 if it exists
        const v1State = v2State ? translateV2StateToV1(v2State) : undefined;

        // Convert v2 responses to v1 if they exist
        // TODO: I don't think I need this.
        const _v1Responses = v2Responses ? v2Responses.map(translateV2MemoryToV1) : undefined;

        // Create a v1-compatible callback wrapper if needed
        let v1Callback: V1HandlerCallback | undefined;

        if (v2Callback) {
          v1Callback = async (v1Response, files?) => {
            // Convert v1 response to v2 format
            const v2Response = translateV1ContentToV2(v1Response);

            // Call v2 callback with converted response
            const v2Result = await v2Callback(v2Response, files);

            // Convert v2 result memories to v1 format
            return v2Result.map(translateV2MemoryToV1);
          };
        }

        // Call the original v1 handler
        return await v1Evaluator.handler(compatRuntime, v1Memory, v1State, options, v1Callback);
      } catch (error) {
        console.error(`[Compat Layer] Error in v1 evaluator handler:`, error);
        throw error;
      }
    },
  };
}

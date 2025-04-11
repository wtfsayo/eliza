/**
 * Action translator module for converting between V1 and V2 action formats
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import {
  Action as V1Action,
  IAgentRuntime as V1IAgentRuntime,
  Memory as V1Memory,
  State as V1State,
  HandlerCallback as V1HandlerCallback,
} from '../types';
import {
  Action as V2Action,
  IAgentRuntime as V2IAgentRuntime,
  Memory as V2Memory,
  State as V2State,
  HandlerCallback as V2HandlerCallback,
} from '@elizaos/core-plugin-v2';
import { translateV2MemoryToV1, translateV1MemoryToV2 } from './memory-translator';
import { translateV2StateToV1, translateV1StateToV2 } from './state-translator';
import { CompatAgentRuntime } from '../runtime';
import {
  translateV1ActionExampleToV2,
  translateV2ActionExampleToV1,
} from './action-example-translator';

/**
 * Converts a V1 Action to a V2 Action
 * @param actionV1 The V1 Action to convert
 * @returns A V2-compatible Action object
 */
export function translateV1ActionToV2(actionV1: V1Action): V2Action {
  // Convert action examples if they exist
  const examplesV2 = actionV1.examples
    ? actionV1.examples.map((exampleGroup) =>
        exampleGroup.map((example) => translateV1ActionExampleToV2(example))
      )
    : undefined;

  return {
    name: actionV1.name,
    description: actionV1.description,
    similes: actionV1.similes,
    examples: examplesV2,

    // Convert validate function
    validate: async (runtimeV2: V2IAgentRuntime, messageV2: V2Memory, stateV2?: V2State) => {
      try {
        // Create a compat runtime to use with V1 validator
        const compatRuntime = new CompatAgentRuntime(runtimeV2);

        // Translate V2 message to V1 format
        const messageV1 = translateV2MemoryToV1(messageV2);

        // Translate V2 state to V1 format if provided
        const stateV1 = stateV2 ? translateV2StateToV1(stateV2) : undefined;

        // Call the V1 validator with compatible types
        return await actionV1.validate(compatRuntime, messageV1, stateV1);
      } catch (error) {
        console.error(`Error in V1 action validate ${actionV1.name}:`, error);
        return false;
      }
    },

    // Convert handler function
    handler: async (
      runtimeV2: V2IAgentRuntime,
      messageV2: V2Memory,
      stateV2?: V2State,
      options?: { [key: string]: unknown },
      callbackV2?: V2HandlerCallback,
      responsesV2?: V2Memory[]
    ) => {
      try {
        // Create a compat runtime to use with V1 handler
        const compatRuntime = new CompatAgentRuntime(runtimeV2);

        // Translate V2 message to V1 format
        const messageV1 = translateV2MemoryToV1(messageV2);

        // Translate V2 state to V1 format if provided
        const stateV1 = stateV2 ? translateV2StateToV1(stateV2) : undefined;

        // Create a wrapper for the callback if provided
        let callbackV1: V1HandlerCallback | undefined;
        if (callbackV2) {
          callbackV1 = async (responseV1, files?) => {
            // Need to translate the response content to V2 format
            const result = await callbackV2(responseV1, files);
            return result.map((memory) => translateV2MemoryToV1(memory));
          };
        }

        // Translate response memories if provided
        const responsesV1 = responsesV2
          ? responsesV2.map((memory) => translateV2MemoryToV1(memory))
          : undefined;

        // Call the V1 handler with compatible types
        return await actionV1.handler(compatRuntime, messageV1, stateV1, options, callbackV1);
      } catch (error) {
        console.error(`Error in V1 action handler ${actionV1.name}:`, error);
        throw error;
      }
    },
  };
}

/**
 * Converts a V2 Action to a V1 Action
 * @param actionV2 The V2 Action to convert
 * @returns A V1-compatible Action object
 */
export function translateV2ActionToV1(actionV2: V2Action): V1Action {
  // Convert action examples if they exist
  const examplesV1 = actionV2.examples
    ? actionV2.examples.map((exampleGroup) =>
        exampleGroup.map((example) => translateV2ActionExampleToV1(example))
      )
    : [];

  return {
    name: actionV2.name,
    description: actionV2.description,
    // V1 requires similes array, so ensure it exists
    similes: actionV2.similes || [],
    // V1 requires examples array, so ensure it exists
    examples: examplesV1,

    // Convert validate function
    validate: async (runtimeV1: V1IAgentRuntime, messageV1: V1Memory, stateV1?: V1State) => {
      try {
        // Translate V1 message to V2 format
        const messageV2 = translateV1MemoryToV2(messageV1);

        // Translate V1 state to V2 format if provided
        const stateV2 = stateV1 ? translateV1StateToV2(stateV1) : undefined;

        // Call the V2 validator
        return await actionV2.validate(runtimeV1 as any, messageV2, stateV2);
      } catch (error) {
        console.error(`Error in V2 action validate ${actionV2.name}:`, error);
        return false;
      }
    },

    // Convert handler function
    handler: async (
      runtimeV1: V1IAgentRuntime,
      messageV1: V1Memory,
      stateV1?: V1State,
      options?: { [key: string]: unknown },
      callbackV1?: V1HandlerCallback
    ) => {
      try {
        // Translate V1 message to V2 format
        const messageV2 = translateV1MemoryToV2(messageV1);

        // Translate V1 state to V2 format if provided
        const stateV2 = stateV1 ? translateV1StateToV2(stateV1) : undefined;

        // Create a wrapper for the callback if provided
        let callbackV2: V2HandlerCallback | undefined;
        if (callbackV1) {
          callbackV2 = async (responseV2, files?) => {
            // Translate the response to V1 format
            const result = await callbackV1(responseV2, files);
            return result.map((memory) => translateV1MemoryToV2(memory));
          };
        }

        // Call the V2 handler
        return await actionV2.handler(runtimeV1 as any, messageV2, stateV2, options, callbackV2);
      } catch (error) {
        console.error(`Error in V2 action handler ${actionV2.name}:`, error);
        throw error;
      }
    },
  };
}

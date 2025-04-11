/**
 * Evaluator translator module for converting between V1 and V2 evaluator formats
 * This enables compatibility between V1 plugins and the V2 runtime
 */

import {
  Evaluator as V1Evaluator,
  IAgentRuntime as V1IAgentRuntime,
  Memory as V1Memory,
  State as V1State,
  HandlerCallback as V1HandlerCallback,
  EvaluationExample as V1EvaluationExample,
} from '../types';
import {
  Evaluator as V2Evaluator,
  IAgentRuntime as V2IAgentRuntime,
  Memory as V2Memory,
  State as V2State,
  HandlerCallback as V2HandlerCallback,
  EvaluationExample as V2EvaluationExample,
} from '@elizaos/core-plugin-v2';
import { translateV2MemoryToV1, translateV1MemoryToV2 } from './memory-translator';
import { translateV2StateToV1, translateV1StateToV2 } from './state-translator';
import { CompatAgentRuntime } from '../runtime';
import {
  translateV1ActionExampleToV2,
  translateV2ActionExampleToV1,
} from './action-example-translator';

/**
 * Converts a V1 EvaluationExample to a V2 EvaluationExample
 * @param example The V1 EvaluationExample to convert
 * @returns A V2-compatible EvaluationExample
 */
export function translateV1EvaluationExampleToV2(
  example: V1EvaluationExample
): V2EvaluationExample {
  return {
    prompt: example.context || '',
    messages: example.messages.map((message) => translateV1ActionExampleToV2(message)),
    outcome: example.outcome,
  };
}

/**
 * Converts a V2 EvaluationExample to a V1 EvaluationExample
 * @param example The V2 EvaluationExample to convert
 * @returns A V1-compatible EvaluationExample
 */
export function translateV2EvaluationExampleToV1(
  example: V2EvaluationExample
): V1EvaluationExample {
  return {
    context: example.prompt || '',
    messages: example.messages.map((message) => translateV2ActionExampleToV1(message)),
    outcome: example.outcome,
  };
}

/**
 * Converts a V1 Evaluator to a V2 Evaluator
 * @param evaluatorV1 The V1 Evaluator to convert
 * @returns A V2-compatible Evaluator object
 */
export function translateV1EvaluatorToV2(evaluatorV1: V1Evaluator): V2Evaluator {
  // Convert evaluator examples
  const examplesV2 = evaluatorV1.examples.map((example) =>
    translateV1EvaluationExampleToV2(example)
  );

  return {
    name: evaluatorV1.name,
    description: evaluatorV1.description,
    similes: evaluatorV1.similes || [],
    alwaysRun: evaluatorV1.alwaysRun,
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
        return await evaluatorV1.validate(compatRuntime, messageV1, stateV1);
      } catch (error) {
        console.error(`Error in V1 evaluator validate ${evaluatorV1.name}:`, error);
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
        return await evaluatorV1.handler(compatRuntime, messageV1, stateV1, options, callbackV1);
      } catch (error) {
        console.error(`Error in V1 evaluator handler ${evaluatorV1.name}:`, error);
        throw error;
      }
    },
  };
}

/**
 * Converts a V2 Evaluator to a V1 Evaluator
 * @param evaluatorV2 The V2 Evaluator to convert
 * @returns A V1-compatible Evaluator object
 */
export function translateV2EvaluatorToV1(evaluatorV2: V2Evaluator): V1Evaluator {
  // Convert evaluator examples
  const examplesV1 = evaluatorV2.examples.map((example) =>
    translateV2EvaluationExampleToV1(example)
  );

  return {
    name: evaluatorV2.name,
    description: evaluatorV2.description,
    similes: evaluatorV2.similes || [],
    alwaysRun: evaluatorV2.alwaysRun,
    examples: examplesV1,

    // Convert validate function
    validate: async (runtimeV1: V1IAgentRuntime, messageV1: V1Memory, stateV1?: V1State) => {
      try {
        // Translate V1 message to V2 format
        const messageV2 = translateV1MemoryToV2(messageV1);

        // Translate V1 state to V2 format if provided
        const stateV2 = stateV1 ? translateV1StateToV2(stateV1) : undefined;

        // Call the V2 validator
        return await evaluatorV2.validate(runtimeV1 as any, messageV2, stateV2);
      } catch (error) {
        console.error(`Error in V2 evaluator validate ${evaluatorV2.name}:`, error);
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
        return await evaluatorV2.handler(runtimeV1 as any, messageV2, stateV2, options, callbackV2);
      } catch (error) {
        console.error(`Error in V2 evaluator handler ${evaluatorV2.name}:`, error);
        throw error;
      }
    },
  };
}

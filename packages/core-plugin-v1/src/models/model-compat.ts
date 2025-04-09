/**
 * Model Compatibility Layer - Maps V1 models to V2 models
 *
 * This file contains compatibility functions for V1 model operations that use V2's model system.
 * It allows V1 plugins to interact with V2 models through familiar interfaces.
 */

import { ModelType, IAgentRuntime as V2IAgentRuntime } from '@elizaos/core-plugin-v2';
import { ModelClass } from '../types';

/**
 * Maps a V1 ModelClass to the corresponding V2 ModelType
 * @param modelClass V1 model class
 * @returns V2 model type
 */
export function mapModelClassToModelType(modelClass: ModelClass): string {
  switch (modelClass) {
    case ModelClass.SMALL:
      return ModelType.TEXT_SMALL;
    case ModelClass.MEDIUM:
    case ModelClass.LARGE:
      return ModelType.TEXT_LARGE;
    case ModelClass.EMBEDDING:
      return ModelType.TEXT_EMBEDDING;
    case ModelClass.IMAGE:
      return ModelType.IMAGE;
    default:
      // Default to TEXT_LARGE for unknown models
      console.warn(`[Compat Layer] Unknown model class ${modelClass}, defaulting to TEXT_LARGE`);
      return ModelType.TEXT_LARGE;
  }
}

/**
 * Compatibility implementation of generateText using V2's useModel
 */
export async function generateText(params: {
  runtime: { getV2Runtime: () => V2IAgentRuntime };
  context: string;
  modelClass?: ModelClass;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  frequencyPenalty?: number;
  presencePenalty?: number;
}): Promise<string> {
  const {
    runtime,
    context,
    modelClass = ModelClass.LARGE,
    temperature = 0.7,
    maxTokens = 2048,
    stop = [],
    frequencyPenalty = 0,
    presencePenalty = 0,
  } = params;

  const v2Runtime = runtime.getV2Runtime();
  const modelType = mapModelClassToModelType(modelClass);

  try {
    console.log(`[Compat Layer] Generating text with model ${modelType}`);
    const result = await v2Runtime.useModel(modelType, {
      runtime: v2Runtime,
      prompt: context,
      temperature,
      maxTokens,
      stopSequences: stop,
      frequencyPenalty,
      presencePenalty,
    });

    return result as string;
  } catch (error) {
    console.error(`[Compat Layer] Error generating text:`, error);
    throw error;
  }
}

/**
 * Compatibility implementation of generateEmbedding using V2's useModel
 */
export async function generateEmbedding(params: {
  runtime: { getV2Runtime: () => V2IAgentRuntime };
  input: string;
}): Promise<number[]> {
  const { runtime, input } = params;
  const v2Runtime = runtime.getV2Runtime();

  try {
    console.log(`[Compat Layer] Generating embedding`);
    const result = await v2Runtime.useModel(ModelType.TEXT_EMBEDDING, {
      runtime: v2Runtime,
      text: input,
    });

    return result as number[];
  } catch (error) {
    console.error(`[Compat Layer] Error generating embedding:`, error);
    throw error;
  }
}

/**
 * Compatibility implementation of generateImage using V2's useModel
 */
export async function generateImage(params: {
  runtime: { getV2Runtime: () => V2IAgentRuntime };
  prompt: string;
  count?: number;
  size?: string;
}): Promise<Array<{ url: string }>> {
  const { runtime, prompt, count = 1, size = '1024x1024' } = params;
  const v2Runtime = runtime.getV2Runtime();

  try {
    console.log(`[Compat Layer] Generating image`);
    const result = await v2Runtime.useModel(ModelType.IMAGE, {
      runtime: v2Runtime,
      prompt,
      count,
      size,
    });

    return result as Array<{ url: string }>;
  } catch (error) {
    console.error(`[Compat Layer] Error generating image:`, error);
    throw error;
  }
}

/**
 * Compatibility implementation of translateText using V2's useModel
 * This is a new capability in V2 that might not exist in V1
 */
export async function translateText(params: {
  runtime: { getV2Runtime: () => V2IAgentRuntime };
  text: string;
  targetLanguage: string;
}): Promise<string> {
  const { runtime, text, targetLanguage } = params;
  const v2Runtime = runtime.getV2Runtime();

  try {
    console.log(`[Compat Layer] Translating text to ${targetLanguage}`);
    // Use reasoning model for translation tasks
    const prompt = `Translate the following text to ${targetLanguage}:\n\n"${text}"\n\nTranslation:`;

    const result = await v2Runtime.useModel(ModelType.TEXT_REASONING_LARGE, {
      runtime: v2Runtime,
      prompt,
      temperature: 0.3, // Lower temperature for more deterministic translation
      maxTokens: text.length * 2, // Allocate reasonable token count for translation
    });

    return result as string;
  } catch (error) {
    console.error(`[Compat Layer] Error translating text:`, error);
    throw error;
  }
}

/**
 * Compatibility implementation of describeImage using V2's useModel
 */
export async function describeImage(params: {
  runtime: { getV2Runtime: () => V2IAgentRuntime };
  imageUrl: string;
}): Promise<{ title: string; description: string }> {
  const { runtime, imageUrl } = params;
  const v2Runtime = runtime.getV2Runtime();

  try {
    console.log(`[Compat Layer] Describing image at ${imageUrl}`);
    const result = await v2Runtime.useModel(ModelType.IMAGE_DESCRIPTION, {
      runtime: v2Runtime,
      imageUrl,
    });

    return result as { title: string; description: string };
  } catch (error) {
    console.error(`[Compat Layer] Error describing image:`, error);
    return {
      title: 'Image',
      description: 'Failed to describe image due to an error.',
    };
  }
}

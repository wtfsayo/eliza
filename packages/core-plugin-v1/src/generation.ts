import { type Content, type IAgentRuntime as V1IAgentRuntime, ModelClass } from './types';
import { CompatAgentRuntime } from './runtime';
import {
  ModelType as V2ModelType,
  TextGenerationParams,
  ObjectGenerationParams,
  ImageGenerationParams,
  logger,
} from '@elizaos/core-plugin-v2';
import type { ZodSchema } from 'zod';

/**
 * Trims the provided text context to a specified token limit using V2's tokenizer model.
 */
export async function trimTokens(
  context: string,
  maxTokens: number,
  runtime: V1IAgentRuntime
): Promise<string> {
  if (!context) return '';
  if (maxTokens <= 0) throw new Error('maxTokens must be positive');

  try {
    const compatRuntime = runtime as CompatAgentRuntime;

    // Encode the text into tokens using V2's tokenizer model
    const tokensResult = await compatRuntime._v2Runtime.useModel(
      V2ModelType.TEXT_TOKENIZER_ENCODE,
      {
        prompt: context,
        modelType: V2ModelType.TEXT_LARGE,
      }
    );

    const tokens = tokensResult as number[];

    // If already within limits, return unchanged
    if (tokens.length <= maxTokens) {
      return context;
    }

    // Keep the most recent tokens by slicing from the end
    const truncatedTokens = tokens.slice(-maxTokens);

    // Decode back to text using V2's tokenizer model
    const decodedText = await compatRuntime._v2Runtime.useModel(V2ModelType.TEXT_TOKENIZER_DECODE, {
      tokens: truncatedTokens,
      modelType: V2ModelType.TEXT_LARGE,
    });

    return decodedText as string;
  } catch (error) {
    logger.error('[Compat Layer] Error in trimTokens:', error);
    // Return truncated string if tokenization fails
    return context.slice(-maxTokens * 4); // Rough estimate of 4 chars per token
  }
}

/**
 * Maps a V1 ModelClass to a V2 ModelType
 */
function mapModelClassToV2ModelType(modelClass: ModelClass): V2ModelType {
  switch (modelClass) {
    case ModelClass.SMALL:
      return V2ModelType.TEXT_SMALL;
    case ModelClass.MEDIUM:
      return V2ModelType.TEXT_MEDIUM;
    case ModelClass.LARGE:
      return V2ModelType.TEXT_LARGE;
    default:
      logger.warn(`[Compat Layer] Unknown model class: ${modelClass}, defaulting to TEXT_LARGE`);
      return V2ModelType.TEXT_LARGE;
  }
}

/**
 * Generate text using V2's useModel
 */
export async function generateText({
  runtime,
  context,
  modelClass,
  tools = {},
  onStepFinish,
  maxSteps = 1,
  stop,
  customSystemPrompt,
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
  tools?: Record<string, any>;
  onStepFinish?: (event: any) => Promise<void> | void;
  maxSteps?: number;
  stop?: string[];
  customSystemPrompt?: string;
}): Promise<string> {
  if (!context) {
    logger.error('[Compat Layer] generateText context is empty');
    return '';
  }

  try {
    const compatRuntime = runtime as CompatAgentRuntime;

    // Map V1 modelClass to V2 ModelType
    const v2ModelType = mapModelClassToV2ModelType(modelClass);
    logger.info(`[Compat Layer] Mapped V1 modelClass ${modelClass} to V2 ModelType ${v2ModelType}`);

    // Create params object for V2's useModel
    const params: TextGenerationParams = {
      prompt: context,
      system: customSystemPrompt || runtime.character?.system,
      temperature: runtime.character?.settings?.modelConfig?.temperature,
      stop: stop,
    };

    // Remove undefined properties
    Object.keys(params).forEach((key) => params[key] === undefined && delete params[key]);

    if (Object.keys(tools).length > 0 || onStepFinish || maxSteps > 1) {
      logger.warn(
        '[Compat Layer] Tool use/steps are not fully supported in compat mode for generateText'
      );
    }

    // Call V2's useModel
    const result = await compatRuntime._v2Runtime.useModel(v2ModelType, params);

    return result as string;
  } catch (error) {
    logger.error('[Compat Layer] Error in generateText:', error);
    throw error;
  }
}

/**
 * Sends a message to the model to determine if it should respond to the given context.
 */
export async function generateShouldRespond({
  runtime,
  context,
  modelClass,
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
}): Promise<'RESPOND' | 'IGNORE' | 'STOP' | null> {
  let retryDelay = 1000;
  while (true) {
    try {
      logger.debug('[Compat Layer] Attempting to generate text with context for shouldRespond');
      const response = await generateText({
        runtime,
        context,
        modelClass,
      });

      logger.debug('[Compat Layer] Received response for shouldRespond:', response);
      const parsedResponse = parseShouldRespondFromText(response.trim());
      if (parsedResponse) {
        logger.debug('[Compat Layer] Parsed shouldRespond response:', parsedResponse);
        return parsedResponse;
      } else {
        logger.debug('[Compat Layer] generateShouldRespond no response');
      }
    } catch (error) {
      logger.error('[Compat Layer] Error in generateShouldRespond:', error);
    }

    logger.log(`[Compat Layer] Retrying in ${retryDelay}ms...`);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    retryDelay *= 2;
  }
}

/**
 * Parses a string response to determine if the agent should respond
 */
function parseShouldRespondFromText(text: string): 'RESPOND' | 'IGNORE' | 'STOP' | null {
  const normalized = text.toUpperCase().trim();

  if (normalized === 'RESPOND') return 'RESPOND';
  if (normalized === 'IGNORE') return 'IGNORE';
  if (normalized === 'STOP') return 'STOP';

  return null;
}

/**
 * Sends a message to the model and parses the response as a boolean value
 */
export async function generateTrueOrFalse({
  runtime,
  context = '',
  modelClass,
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
}): Promise<boolean> {
  let retryDelay = 1000;

  while (true) {
    try {
      const response = await generateText({
        runtime,
        context,
        modelClass,
        stop: ['\n'],
      });

      const parsedResponse = parseBooleanFromText(response.trim());
      if (parsedResponse !== null) {
        return parsedResponse;
      }
    } catch (error) {
      logger.error('[Compat Layer] Error in generateTrueOrFalse:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    retryDelay *= 2;
  }
}

/**
 * Parses a text response into a boolean value
 */
function parseBooleanFromText(text: string): boolean | null {
  const normalized = text.toLowerCase().trim();

  if (['true', 'yes', '1', 't', 'y'].includes(normalized)) return true;
  if (['false', 'no', '0', 'f', 'n'].includes(normalized)) return false;

  return null;
}

/**
 * Parses a JSON array from text
 */
function parseJsonArrayFromText(text: string): string[] | null {
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      const jsonText = match[0];
      const parsed = JSON.parse(jsonText);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
    return null;
  } catch (e) {
    logger.error('[Compat Layer] Error parsing JSON array:', e);
    return null;
  }
}

/**
 * Parses a JSON object from text
 */
function parseJSONObjectFromText(text: string): any | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      const jsonText = match[0];
      return JSON.parse(jsonText);
    }
    return null;
  } catch (e) {
    logger.error('[Compat Layer] Error parsing JSON object:', e);
    return null;
  }
}

/**
 * Send a message to the model and parse the response as a string array
 */
export async function generateTextArray({
  runtime,
  context,
  modelClass,
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
}): Promise<string[]> {
  if (!context) {
    logger.error('[Compat Layer] generateTextArray context is empty');
    return [];
  }

  let retryDelay = 1000;

  while (true) {
    try {
      const response = await generateText({
        runtime,
        context,
        modelClass,
      });

      const parsedResponse = parseJsonArrayFromText(response);
      if (parsedResponse) {
        return parsedResponse;
      }
    } catch (error) {
      logger.error('[Compat Layer] Error in generateTextArray:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    retryDelay *= 2;
  }
}

/**
 * Generate an object using the deprecated method (generateText + parsing)
 */
export async function generateObjectDeprecated({
  runtime,
  context,
  modelClass,
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
}): Promise<any> {
  if (!context) {
    logger.error('[Compat Layer] generateObjectDeprecated context is empty');
    return null;
  }

  let retryDelay = 1000;

  while (true) {
    try {
      const response = await generateText({
        runtime,
        context,
        modelClass,
      });

      const parsedResponse = parseJSONObjectFromText(response);
      if (parsedResponse) {
        return parsedResponse;
      }
    } catch (error) {
      logger.error('[Compat Layer] Error in generateObjectDeprecated:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    retryDelay *= 2;
  }
}

/**
 * Generate an array of objects using generateText + parsing
 */
export async function generateObjectArray({
  runtime,
  context,
  modelClass,
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
}): Promise<any[]> {
  if (!context) {
    logger.error('[Compat Layer] generateObjectArray context is empty');
    return [];
  }

  let retryDelay = 1000;

  while (true) {
    try {
      const response = await generateText({
        runtime,
        context,
        modelClass,
      });

      const parsedResponse = parseJsonArrayFromText(response);
      if (parsedResponse) {
        return parsedResponse;
      }
    } catch (error) {
      logger.error('[Compat Layer] Error in generateObjectArray:', error);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelay));
    retryDelay *= 2;
  }
}

/**
 * Generate a message response (Content object)
 */
export async function generateMessageResponse({
  runtime,
  context,
  modelClass,
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
}): Promise<Content> {
  const compatRuntime = runtime as CompatAgentRuntime;

  context = await trimTokens(context, 8000, runtime); // Using 8000 as a reasonable default
  logger.debug('[Compat Layer] Context for message response:', context);

  let retryLength = 1000; // exponential backoff
  while (true) {
    try {
      logger.log('[Compat Layer] Generating message response..');

      const response = await generateText({
        runtime,
        context,
        modelClass,
      });

      // try parsing the response as JSON, if null then try again
      const parsedContent = parseJSONObjectFromText(response) as Content;
      if (!parsedContent) {
        logger.debug('[Compat Layer] parsedContent is null, retrying');
        continue;
      }

      return parsedContent;
    } catch (error) {
      logger.error('[Compat Layer] ERROR:', error);
      // wait with exponential backoff
      retryLength *= 2;
      await new Promise((resolve) => setTimeout(resolve, retryLength));
      logger.debug('[Compat Layer] Retrying...');
    }
  }
}

/**
 * Result type for generateObject
 */
interface GenerateObjectResult<T> {
  object: T;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Generate a structured object using V2's object generation model
 */
export async function generateObject({
  runtime,
  context,
  modelClass,
  schema,
  schemaName,
  schemaDescription,
  mode = 'json',
}: {
  runtime: V1IAgentRuntime;
  context: string;
  modelClass: ModelClass;
  schema?: ZodSchema;
  schemaName?: string;
  schemaDescription?: string;
  mode?: 'auto' | 'json' | 'tool';
}): Promise<GenerateObjectResult<unknown>> {
  if (!context) {
    const errorMessage = '[Compat Layer] generateObject context is empty';
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }

  try {
    const compatRuntime = runtime as CompatAgentRuntime;

    // Map V1 modelClass to V2 ModelType for object generation
    let v2ModelType: V2ModelType;
    switch (modelClass) {
      case ModelClass.SMALL:
        v2ModelType = V2ModelType.OBJECT_SMALL;
        break;
      case ModelClass.MEDIUM:
        v2ModelType = V2ModelType.OBJECT_MEDIUM;
        break;
      case ModelClass.LARGE:
        v2ModelType = V2ModelType.OBJECT_LARGE;
        break;
      default:
        v2ModelType = V2ModelType.OBJECT_LARGE;
    }

    logger.info(`[Compat Layer] Using V2 model type ${v2ModelType} for object generation`);

    // Create params object for V2's useModel
    const params: ObjectGenerationParams = {
      prompt: context,
      schema,
      schemaName,
      schemaDescription,
      output: mode,
      temperature: runtime.character?.settings?.modelConfig?.temperature,
    };

    // Remove undefined properties
    Object.keys(params).forEach((key) => params[key] === undefined && delete params[key]);

    // Call V2's useModel
    const result = await compatRuntime._v2Runtime.useModel(v2ModelType, params);

    // V2's useModel for object generation returns the object directly
    // Wrap it in GenerateObjectResult format for V1 compatibility
    return {
      object: result,
      usage: {}, // V2 might not provide usage stats, so we return an empty object
    };
  } catch (error) {
    logger.error('[Compat Layer] Error in generateObject:', error);
    throw error;
  }
}

/**
 * Generate an image from a prompt
 */
export const generateImage = async (
  data: {
    prompt: string;
    width: number;
    height: number;
    count?: number;
    negativePrompt?: string;
    numIterations?: number;
    guidanceScale?: number;
    seed?: number;
    modelId?: string;
    jobId?: string;
    stylePreset?: string;
    hideWatermark?: boolean;
    safeMode?: boolean;
    cfgScale?: number;
  },
  runtime: V1IAgentRuntime
): Promise<{
  success: boolean;
  data?: string[];
  error?: any;
}> => {
  try {
    const compatRuntime = runtime as CompatAgentRuntime;

    logger.info('[Compat Layer] Generating image using V2 image model');

    // Map parameters to V2's image generation params
    const params: ImageGenerationParams = {
      prompt: data.prompt,
      negativePrompt: data.negativePrompt,
      size: `${data.width}x${data.height}`,
      count: data.count || 1,
      guidanceScale: data.guidanceScale,
      seed: data.seed,
      steps: data.numIterations,
    };

    // Remove undefined properties
    Object.keys(params).forEach((key) => params[key] === undefined && delete params[key]);

    // Call V2's useModel
    const result = await compatRuntime._v2Runtime.useModel(V2ModelType.IMAGE, params);

    // V2's useModel for image generation returns { url: string }[]
    const urls = (result as { url: string }[]).map((item) => item.url);

    // Fetch each image and convert to base64
    const base64Images = await Promise.all(
      urls.map(async (url) => {
        const imageResponse = await compatRuntime._v2Runtime.fetch(url);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
        }

        const blob = await imageResponse.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');

        // Determine MIME type based on URL or default to jpeg
        const mimeType = url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

        return `data:${mimeType};base64,${base64}`;
      })
    );

    return { success: true, data: base64Images };
  } catch (error) {
    logger.error('[Compat Layer] Error in generateImage:', error);
    return { success: false, error };
  }
};

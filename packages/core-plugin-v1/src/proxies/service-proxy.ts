/**
 * Service Proxy - Maps V1 services to V2 services
 *
 * This file contains proxy implementations for V1 services that delegate to V2 services.
 * It allows V1 plugins to interact with V2 services through familiar interfaces.
 */

import { ServiceType as V1ServiceType, Service as V1Service } from '../types';
import {
  ServiceType as V2ServiceType,
  IAgentRuntime as V2IAgentRuntime,
  Service as V2Service,
} from '@elizaos/core-plugin-v2';
import { CompatAgentRuntime } from '../runtime';

/**
 * Maps a V1 service type to a V2 service type
 * @param v1Type The V1 service type
 * @returns The corresponding V2 service type
 */
export function mapServiceType(v1Type: V1ServiceType): string {
  const mappings: Record<string, string> = {
    // Core services that exist in both
    [V1ServiceType.TRANSCRIPTION]: V2ServiceType.TRANSCRIPTION,
    [V1ServiceType.VIDEO]: V2ServiceType.VIDEO,
    [V1ServiceType.BROWSER]: V2ServiceType.BROWSER,
    [V1ServiceType.PDF]: V2ServiceType.PDF,
    [V1ServiceType.AWS_S3]: V2ServiceType.REMOTE_FILES,
    [V1ServiceType.WEB_SEARCH]: V2ServiceType.WEB_SEARCH,

    // Services with naming differences
    [V1ServiceType.TEXT_GENERATION]: 'text_generation', // Not in V2 enum but may exist
    [V1ServiceType.IMAGE_DESCRIPTION]: 'image_description', // Similar
    [V1ServiceType.SPEECH_GENERATION]: 'speech_generation', // May require custom handling

    // Services that may need special handling
    [V1ServiceType.INTIFACE]: 'intiface', // Custom
    [V1ServiceType.BUTTPLUG]: 'buttplug', // Custom
    [V1ServiceType.SLACK]: 'slack', // Custom
    [V1ServiceType.VERIFIABLE_LOGGING]: 'verifiable_logging', // Custom
    [V1ServiceType.IRYS]: 'irys', // Custom
    [V1ServiceType.TEE_LOG]: V2ServiceType.TEE, // Different name in V2
    [V1ServiceType.GOPLUS_SECURITY]: 'goplus_security', // Custom
    [V1ServiceType.EMAIL_AUTOMATION]: V2ServiceType.EMAIL, // Different name in V2
    [V1ServiceType.NKN_CLIENT_SERVICE]: 'nkn_client_service', // Custom
  };

  return mappings[v1Type] || v1Type;
}

/**
 * Creates a V1 service proxy that delegates to a V2 service
 * @param compatRuntime The CompatAgentRuntime instance
 * @param serviceType The V1 service type
 * @returns A V1-compatible service that delegates to V2
 */
export function createServiceProxy(
  compatRuntime: CompatAgentRuntime,
  serviceType: V1ServiceType
): V1Service {
  const v2Runtime = compatRuntime.getV2Runtime();
  const v2ServiceType = mapServiceType(serviceType);

  // Basic proxy implementation with default methods
  const baseProxy: V1Service = {
    serviceType: serviceType,

    // This method is called to initialize the service
    initialize: async (runtime: any) => {
      console.log(`[Compat Layer] Initializing service proxy for ${serviceType}`);
      // Most V2 services are already initialized, no-op for most cases
      return Promise.resolve();
    },
  };

  // Specialized service proxies based on service type
  switch (serviceType) {
    case V1ServiceType.IMAGE_DESCRIPTION:
      return createImageDescriptionProxy(compatRuntime, v2Runtime, baseProxy);

    case V1ServiceType.TRANSCRIPTION:
      return createTranscriptionProxy(compatRuntime, v2Runtime, baseProxy);

    case V1ServiceType.VIDEO:
      return createVideoProxy(compatRuntime, v2Runtime, baseProxy);

    case V1ServiceType.TEXT_GENERATION:
      return createTextGenerationProxy(compatRuntime, v2Runtime, baseProxy);

    case V1ServiceType.BROWSER:
      return createBrowserProxy(compatRuntime, v2Runtime, baseProxy);

    case V1ServiceType.SPEECH_GENERATION:
      return createSpeechGenerationProxy(compatRuntime, v2Runtime, baseProxy);

    case V1ServiceType.PDF:
      return createPdfProxy(compatRuntime, v2Runtime, baseProxy);

    case V1ServiceType.AWS_S3:
      return createAwsS3Proxy(compatRuntime, v2Runtime, baseProxy);

    // Add more specialized proxies as needed

    default:
      console.warn(`[Compat Layer] No specialized proxy for ${serviceType}, using generic proxy`);
      return baseProxy;
  }
}

/**
 * Service-specific interfaces that extend V1Service
 */
interface V1ImageDescriptionService extends V1Service {
  describeImage(imageUrl: string): Promise<{ title: string; description: string }>;
}

interface V1TranscriptionService extends V1Service {
  transcribe(audioBuffer: ArrayBuffer): Promise<string | null>;
  transcribeAttachment(audioBuffer: ArrayBuffer): Promise<string | null>;
  transcribeLocally(audioBuffer: ArrayBuffer): Promise<string | null>;
  transcribeAttachmentLocally(audioBuffer: ArrayBuffer): Promise<string | null>;
}

interface V1VideoService extends V1Service {
  isVideoUrl(url: string): boolean;
  fetchVideoInfo(url: string): Promise<any>;
  downloadVideo(videoInfo: any): Promise<string>;
  processVideo(url: string, runtime: any): Promise<any>;
}

interface V1TextGenerationService extends V1Service {
  initializeModel(): Promise<void>;
  queueMessageCompletion(
    context: string,
    temperature: number,
    stop: string[],
    frequency_penalty: number,
    presence_penalty: number,
    max_tokens: number
  ): Promise<any>;
  queueTextCompletion(
    context: string,
    temperature: number,
    stop: string[],
    frequency_penalty: number,
    presence_penalty: number,
    max_tokens: number
  ): Promise<string>;
  getEmbeddingResponse(input: string): Promise<number[] | undefined>;
}

interface V1BrowserService extends V1Service {
  closeBrowser(): Promise<void>;
  getPageContent(
    url: string,
    runtime: any
  ): Promise<{ title: string; description: string; bodyContent: string }>;
}

interface V1SpeechGenerationService extends V1Service {
  getInstance(): V1SpeechGenerationService;
  generate(runtime: any, text: string): Promise<any>;
}

interface V1PdfService extends V1Service {
  getInstance(): V1PdfService;
  convertPdfToText(pdfBuffer: Buffer): Promise<string>;
}

interface V1S3Service extends V1Service {
  uploadFile(
    imagePath: string,
    subDirectory: string,
    useSignedUrl: boolean,
    expiresIn: number
  ): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }>;
  generateSignedUrl(fileName: string, expiresIn: number): Promise<string>;
}

/**
 * Creates a proxy for the image description service
 */
function createImageDescriptionProxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1ImageDescriptionService {
  const proxy: V1ImageDescriptionService = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    describeImage: async (imageUrl: string) => {
      try {
        // Use V2 model system for image description
        const result = await v2Runtime.useModel('IMAGE_DESCRIPTION', {
          imageUrl,
          runtime: v2Runtime,
        });

        return result || { title: 'Image', description: 'No description available' };
      } catch (error) {
        console.error(`[Compat Layer] Error in image description service:`, error);
        return { title: 'Image', description: 'Failed to describe image' };
      }
    },
  };

  return proxy;
}

/**
 * Creates a proxy for the transcription service
 */
function createTranscriptionProxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1TranscriptionService {
  const proxy: V1TranscriptionService = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    transcribe: async (audioBuffer: ArrayBuffer) => {
      try {
        // Use V2 model system for transcription
        const result = await v2Runtime.useModel('TRANSCRIPTION', {
          audioData: audioBuffer,
          runtime: v2Runtime,
        });

        return result || null;
      } catch (error) {
        console.error(`[Compat Layer] Error in transcription service:`, error);
        return null;
      }
    },

    transcribeAttachment: async (audioBuffer: ArrayBuffer) => {
      // Create a new proxy to avoid direct reference to uninitialized self
      const service = createTranscriptionProxy(compatRuntime, v2Runtime, baseProxy);
      return service.transcribe(audioBuffer);
    },

    transcribeLocally: async (audioBuffer: ArrayBuffer) => {
      // Try to find a local transcription option in V2
      const v2Service = v2Runtime.getService(V2ServiceType.TRANSCRIPTION);
      if (v2Service && 'transcribeLocally' in v2Service) {
        return (v2Service as any).transcribeLocally(audioBuffer);
      }
      return null;
    },

    transcribeAttachmentLocally: async (audioBuffer: ArrayBuffer) => {
      // Create a new proxy to avoid direct reference to uninitialized self
      const service = createTranscriptionProxy(compatRuntime, v2Runtime, baseProxy);
      return service.transcribeLocally(audioBuffer);
    },
  };

  return proxy;
}

/**
 * Creates a proxy for the video service
 */
function createVideoProxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1VideoService {
  const proxy: V1VideoService = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    isVideoUrl: (url: string) => {
      const v2Service = v2Runtime.getService(V2ServiceType.VIDEO);
      if (v2Service && 'isVideoUrl' in v2Service) {
        return (v2Service as any).isVideoUrl(url);
      }
      // Fallback check for common video extensions
      return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
    },

    fetchVideoInfo: async (url: string) => {
      const v2Service = v2Runtime.getService(V2ServiceType.VIDEO);
      if (v2Service && 'fetchVideoInfo' in v2Service) {
        return (v2Service as any).fetchVideoInfo(url);
      }
      throw new Error('V2 video service missing fetchVideoInfo method');
    },

    downloadVideo: async (videoInfo: any) => {
      const v2Service = v2Runtime.getService(V2ServiceType.VIDEO);
      if (v2Service && 'downloadVideo' in v2Service) {
        return (v2Service as any).downloadVideo(videoInfo);
      }
      throw new Error('V2 video service missing downloadVideo method');
    },

    processVideo: async (url: string, runtime: any) => {
      const v2Service = v2Runtime.getService(V2ServiceType.VIDEO);
      if (v2Service && 'processVideo' in v2Service) {
        return (v2Service as any).processVideo(url, v2Runtime);
      }
      throw new Error('V2 video service missing processVideo method');
    },
  };

  return proxy;
}

/**
 * Creates a proxy for the text generation service
 */
function createTextGenerationProxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1TextGenerationService {
  const proxy: V1TextGenerationService = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    initializeModel: async () => {
      // No-op, V2 models are initialized differently
      return Promise.resolve();
    },

    queueMessageCompletion: async (
      context: string,
      temperature: number,
      stop: string[],
      frequency_penalty: number,
      presence_penalty: number,
      max_tokens: number
    ) => {
      try {
        return await v2Runtime.useModel('TEXT_LARGE', {
          runtime: v2Runtime,
          prompt: context,
          temperature,
          stopSequences: stop,
          frequencyPenalty: frequency_penalty,
          presencePenalty: presence_penalty,
          maxTokens: max_tokens,
        });
      } catch (error) {
        console.error(`[Compat Layer] Error in text generation service:`, error);
        throw error;
      }
    },

    queueTextCompletion: async (
      context: string,
      temperature: number,
      stop: string[],
      frequency_penalty: number,
      presence_penalty: number,
      max_tokens: number
    ) => {
      try {
        return await v2Runtime.useModel('TEXT_LARGE', {
          runtime: v2Runtime,
          prompt: context,
          temperature,
          stopSequences: stop,
          frequencyPenalty: frequency_penalty,
          presencePenalty: presence_penalty,
          maxTokens: max_tokens,
        });
      } catch (error) {
        console.error(`[Compat Layer] Error in text completion service:`, error);
        throw error;
      }
    },

    getEmbeddingResponse: async (input: string) => {
      try {
        return await v2Runtime.useModel('TEXT_EMBEDDING', {
          runtime: v2Runtime,
          text: input,
        });
      } catch (error) {
        console.error(`[Compat Layer] Error getting embedding:`, error);
        return undefined;
      }
    },
  };

  return proxy;
}

/**
 * Creates a proxy for the browser service
 */
function createBrowserProxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1BrowserService {
  const proxy: V1BrowserService = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    closeBrowser: async () => {
      const v2Service = v2Runtime.getService(V2ServiceType.BROWSER);
      if (v2Service && 'stop' in v2Service) {
        return (v2Service as any).stop();
      }
      return Promise.resolve();
    },

    getPageContent: async (url: string, runtime: any) => {
      const v2Service = v2Runtime.getService(V2ServiceType.BROWSER);
      if (v2Service && 'getPageContent' in v2Service) {
        return (v2Service as any).getPageContent(url, v2Runtime);
      }
      throw new Error('V2 browser service missing getPageContent method');
    },
  };

  return proxy;
}

/**
 * Creates a proxy for the speech generation service
 */
function createSpeechGenerationProxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1SpeechGenerationService {
  const proxy: V1SpeechGenerationService = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    getInstance: () => {
      // For singleton pattern, return the proxy itself
      return proxy;
    },

    generate: async (runtime: any, text: string) => {
      try {
        // Use V2 model system for text to speech
        return await v2Runtime.useModel('TEXT_TO_SPEECH', {
          runtime: v2Runtime,
          text: text,
        });
      } catch (error) {
        console.error(`[Compat Layer] Error in speech generation service:`, error);
        throw error;
      }
    },
  };

  return proxy;
}

/**
 * Creates a proxy for the PDF service
 */
function createPdfProxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1PdfService {
  const proxy: V1PdfService = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    getInstance: () => {
      // For singleton pattern, return the proxy itself
      return proxy;
    },

    convertPdfToText: async (pdfBuffer: Buffer) => {
      const v2Service = v2Runtime.getService(V2ServiceType.PDF);
      if (v2Service && 'convertPdfToText' in v2Service) {
        return (v2Service as any).convertPdfToText(pdfBuffer);
      }
      throw new Error('V2 PDF service missing convertPdfToText method');
    },
  };

  return proxy;
}

/**
 * Creates a proxy for the AWS S3 service
 */
function createAwsS3Proxy(
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime,
  baseProxy: V1Service
): V1S3Service {
  const proxy: V1S3Service = {
    // Include required V1Service properties
    serviceType: baseProxy.serviceType,
    initialize: baseProxy.initialize,

    // Add specialized methods
    uploadFile: async (
      imagePath: string,
      subDirectory: string,
      useSignedUrl: boolean,
      expiresIn: number
    ) => {
      const v2Service = v2Runtime.getService(V2ServiceType.REMOTE_FILES);
      if (v2Service && 'uploadFile' in v2Service) {
        return (v2Service as any).uploadFile(imagePath, subDirectory, useSignedUrl, expiresIn);
      }
      throw new Error('V2 remote files service missing uploadFile method');
    },

    generateSignedUrl: async (fileName: string, expiresIn: number) => {
      const v2Service = v2Runtime.getService(V2ServiceType.REMOTE_FILES);
      if (v2Service && 'generateSignedUrl' in v2Service) {
        return (v2Service as any).generateSignedUrl(fileName, expiresIn);
      }
      throw new Error('V2 remote files service missing generateSignedUrl method');
    },
  };

  return proxy;
}

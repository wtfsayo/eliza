/**
 * Service Adapter Factory - Creates V1 service proxies that delegate to V2 services
 *
 * This file contains factory functions for creating V1 service adapter objects
 * that implement V1 service interfaces but delegate to V2 services or models.
 */

import {
  ServiceType as V1ServiceType,
  Service as V1Service,
  ITranscriptionService as V1TranscriptionService,
  IImageDescriptionService as V1ImageDescriptionService,
  IVideoService as V1VideoService,
  ITextGenerationService as V1TextGenerationService,
  IBrowserService as V1BrowserService,
  ISpeechService as V1SpeechService,
  IPdfService as V1PdfService,
  IAwsS3Service as V1AwsS3Service,
} from '../types';
import {
  ServiceType as V2ServiceType,
  IAgentRuntime as V2IAgentRuntime,
  ModelType as V2ModelType,
} from '@elizaos/core-plugin-v2';
import { CompatAgentRuntime } from '../runtime';

/**
 * Maps a V1 service type to a V2 service type
 * @param v1Type The V1 service type
 * @returns The corresponding V2 service type
 */
function mapServiceType(v1Type: V1ServiceType): string {
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
 * Creates a V1 service adapter that delegates to appropriate V2 functionality
 *
 * @param v1Type The V1 service type to create an adapter for
 * @param compatRuntime The CompatAgentRuntime instance (for V1 context/methods)
 * @param v2Runtime The V2IAgentRuntime instance (for V2 calls)
 * @returns A V1 service adapter or null if no adapter is available
 */
export function createV1ServiceAdapter(
  v1Type: V1ServiceType,
  compatRuntime: CompatAgentRuntime,
  v2Runtime: V2IAgentRuntime
): V1Service | null {
  // Common service properties
  const baseService: V1Service = {
    serviceType: v1Type,
    initialize: async () => {
      console.log(`[Compat Layer] Initializing service adapter for ${v1Type}`);
      return Promise.resolve();
    },
  };

  // Create service-specific adapters
  switch (v1Type) {
    case V1ServiceType.IMAGE_DESCRIPTION:
      const imgDescAdapter: V1ImageDescriptionService = {
        serviceType: v1Type,
        initialize: baseService.initialize,
        describeImage: async (imageUrl: string) => {
          try {
            // Use the internal compat method
            return this._v2Runtime.useModel(V2ModelType.IMAGE_DESCRIPTION, {
              imageUrl,
            });
          } catch (error) {
            console.error(`[Compat Layer] Error in image description service:`, error);
            return { title: 'Image', description: 'Failed to describe image' };
          }
        },
      };
      return imgDescAdapter;

    case V1ServiceType.TRANSCRIPTION:
      const transAdapter: V1TranscriptionService = {
        serviceType: v1Type,
        initialize: baseService.initialize,
        transcribe: async (audioBuffer: ArrayBuffer) => {
          try {
            return await v2Runtime.useModel(V2ModelType.TRANSCRIPTION, {
              audioData: audioBuffer,
              runtime: v2Runtime,
            });
          } catch (error) {
            console.error(`[Compat Layer] Error in transcription service:`, error);
            return null;
          }
        },
        transcribeAttachment: function (audioBuffer: ArrayBuffer) {
          return this.transcribe(audioBuffer);
        },
        transcribeLocally: async (audioBuffer: ArrayBuffer) => {
          const v2Service = v2Runtime.getService(V2ServiceType.TRANSCRIPTION);
          if (v2Service && 'transcribeLocally' in v2Service) {
            return (v2Service as any).transcribeLocally(audioBuffer);
          }
          return null;
        },
        transcribeAttachmentLocally: function (audioBuffer: ArrayBuffer) {
          return this.transcribeLocally(audioBuffer);
        },
      };
      return transAdapter;

    case V1ServiceType.VIDEO:
      const videoAdapter: V1VideoService = {
        serviceType: v1Type,
        initialize: baseService.initialize,
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
      return videoAdapter;

    case V1ServiceType.TEXT_GENERATION:
      const txtGenAdapter: V1TextGenerationService = {
        serviceType: v1Type,
        initialize: baseService.initialize,
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
            // Use the internal compat method
            return await compatRuntime._compatGenerateText({
              context,
              temperature,
              stop,
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
            // Use the internal compat method
            return await compatRuntime._compatGenerateText({
              context,
              temperature,
              stop,
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
            // Use the internal compat method
            return await compatRuntime._compatGenerateEmbedding({
              input,
            });
          } catch (error) {
            console.error(`[Compat Layer] Error getting embedding:`, error);
            return undefined;
          }
        },
      };
      return txtGenAdapter;

    case V1ServiceType.BROWSER:
      const browserAdapter: V1BrowserService = {
        serviceType: v1Type,
        initialize: baseService.initialize,
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
      return browserAdapter;

    case V1ServiceType.SPEECH_GENERATION:
      const speechAdapter: V1SpeechService = {
        serviceType: v1Type,
        initialize: baseService.initialize,
        getInstance: function () {
          // For singleton pattern, return this adapter
          return this;
        },
        generate: async (runtime: any, text: string) => {
          try {
            // Use the internal compat method, ignoring the runtime parameter
            return await compatRuntime._compatGenerateSpeech(text);
          } catch (error) {
            console.error(`[Compat Layer] Error in speech generation service:`, error);
            throw error;
          }
        },
      };
      return speechAdapter;

    case V1ServiceType.PDF:
      const pdfAdapter: V1PdfService = {
        serviceType: v1Type,
        initialize: baseService.initialize,
        getInstance: function () {
          // For singleton pattern, return this adapter
          return this;
        },
        convertPdfToText: async (pdfBuffer: Buffer) => {
          const v2Service = v2Runtime.getService(V2ServiceType.PDF);
          if (v2Service && 'convertPdfToText' in v2Service) {
            return (v2Service as any).convertPdfToText(pdfBuffer);
          }
          throw new Error('V2 PDF service missing convertPdfToText method');
        },
      };
      return pdfAdapter;

    case V1ServiceType.AWS_S3:
      const s3Adapter: V1AwsS3Service = {
        serviceType: v1Type,
        initialize: baseService.initialize,
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
      return s3Adapter;

    // Additional services could be added here

    default:
      console.warn(`[Compat Layer] No service adapter available for ${v1Type}`);
      // Attempt to find a matching V2 service by mapped name
      const v2ServiceType = mapServiceType(v1Type);
      const genericV2Service = v2Runtime.getService(v2ServiceType);
      if (genericV2Service) {
        console.log(
          `[Compat Layer] Found generic V2 service for ${v1Type} (${v2ServiceType}). Returning basic adapter.`
        );
        // Return a very basic adapter that implements V1Service interface
        const genericAdapter: V1Service = {
          serviceType: v1Type,
          initialize: baseService.initialize,
        };
        return genericAdapter;
      }
      return null;
  }
}

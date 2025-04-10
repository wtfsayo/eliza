import { CompatAgentRuntime } from '../runtime';
import {
  IAgentRuntime as V1IAgentRuntime,
  Service as V1Service,
  ServiceType as V1ServiceType,
  IBrowserService as V1IBrowserService,
  IPdfService as V1IPdfService,
  IVideoService as V1IVideoService,
  IAwsS3Service as V1IAwsS3Service,
  ISpeechService as V1ISpeechService,
  ITranscriptionService as V1ITranscriptionService,
  ITextGenerationService as V1ITextGenerationService,
  IImageDescriptionService as V1IImageDescriptionService,
} from '../types';

import { ModelType } from '@elizaos/core-plugin-v2';
import { Readable } from 'stream';

/**
 * Service compatibility manager for the CompatAgentRuntime
 * Handles mapping between V1 and V2 service interfaces
 */
export class ServiceCompatManager {
  private runtime: CompatAgentRuntime;
  private services = new Map<V1ServiceType, V1Service>();

  // Map V1 service types to V2 service types
  private v1ToV2ServiceMap = new Map<V1ServiceType, string | null>();

  constructor(runtime: CompatAgentRuntime) {
    this.runtime = runtime;
    this.initServiceMapping();
  }

  /**
   * Initialize the mapping between V1 and V2 service types
   */
  private initServiceMapping(): void {
    // Direct mappings where V2 has an equivalent service
    this.v1ToV2ServiceMap.set(V1ServiceType.BROWSER, 'browser');
    this.v1ToV2ServiceMap.set(V1ServiceType.VIDEO, 'video');
    this.v1ToV2ServiceMap.set(V1ServiceType.PDF, 'pdf');
    this.v1ToV2ServiceMap.set(V1ServiceType.AWS_S3, 'remote_files'); // V2 renamed this
    this.v1ToV2ServiceMap.set(V1ServiceType.WEB_SEARCH, 'web_search');
    this.v1ToV2ServiceMap.set(V1ServiceType.TRANSCRIPTION, 'transcription');
    this.v1ToV2ServiceMap.set(V1ServiceType.EMAIL_AUTOMATION, 'email');
    this.v1ToV2ServiceMap.set(V1ServiceType.TEE_LOG, 'tee');

    // Services that need to use V2 models instead of services
    this.v1ToV2ServiceMap.set(V1ServiceType.SPEECH_GENERATION, null); // Use ModelType.TEXT_TO_SPEECH
    this.v1ToV2ServiceMap.set(V1ServiceType.IMAGE_DESCRIPTION, null); // Use ModelType.IMAGE_DESCRIPTION
    this.v1ToV2ServiceMap.set(V1ServiceType.TEXT_GENERATION, null); // Use various text models

    // No direct equivalents in V2, will need custom implementations
    this.v1ToV2ServiceMap.set(V1ServiceType.SLACK, null);
    this.v1ToV2ServiceMap.set(V1ServiceType.IRYS, null);
    this.v1ToV2ServiceMap.set(V1ServiceType.INTIFACE, null);
    this.v1ToV2ServiceMap.set(V1ServiceType.BUTTPLUG, null);
    this.v1ToV2ServiceMap.set(V1ServiceType.VERIFIABLE_LOGGING, null);
    this.v1ToV2ServiceMap.set(V1ServiceType.GOPLUS_SECURITY, null);
    this.v1ToV2ServiceMap.set(V1ServiceType.NKN_CLIENT_SERVICE, null);
  }

  /**
   * Get a service by type
   * @param serviceType The V1 service type
   * @returns The service or null if not available
   */
  getService<T extends V1Service>(serviceType: V1ServiceType): T | null {
    // Check if service is already cached
    if (this.services.has(serviceType)) {
      return this.services.get(serviceType) as T;
    }

    // Create service adapter
    const service = this.createServiceAdapter<T>(serviceType);
    if (service) {
      this.services.set(serviceType, service);
      return service;
    }

    return null;
  }

  /**
   * Create a service adapter
   * @param serviceType The V1 service type
   * @returns A new service adapter or null
   */
  private createServiceAdapter<T extends V1Service>(serviceType: V1ServiceType): T | null {
    // Get the V2 service type
    const v2ServiceType = this.v1ToV2ServiceMap.get(serviceType);

    if (v2ServiceType) {
      // Direct service mapping - get V2 service and adapt to V1 interface
      try {
        const v2Service = this.runtime._v2Runtime.getService(v2ServiceType);
        if (v2Service) {
          console.log(`[Compat Layer] Creating adapter for V2 service: ${v2ServiceType}`);
          return this.createDirectServiceAdapter<T>(serviceType, v2Service);
        } else {
          console.warn(`[Compat Layer] V2 service not found for type: ${v2ServiceType}`);
        }
      } catch (error) {
        console.error(`[Compat Layer] Error getting V2 service: ${error.message}`);
      }
    }

    // Handle special cases for services that use models in V2
    switch (serviceType) {
      case V1ServiceType.SPEECH_GENERATION:
        console.log(`[Compat Layer] Creating speech service adapter using V2 models`);
        return this.createSpeechServiceAdapter() as unknown as T;
      case V1ServiceType.IMAGE_DESCRIPTION:
        console.log(`[Compat Layer] Creating image description adapter using V2 models`);
        return this.createImageDescriptionAdapter() as unknown as T;
      case V1ServiceType.TEXT_GENERATION:
        console.log(`[Compat Layer] Creating text generation adapter using V2 models`);
        return this.createTextGenerationAdapter() as unknown as T;
      default:
        // No matching adapter
        console.warn(`[Compat Layer] No adapter available for service type: ${serviceType}`);
        return null;
    }
  }

  /**
   * Create a direct service adapter that maps V1 interface to V2 service
   * @param serviceType The V1 service type
   * @param v2Service The V2 service instance
   * @returns A new service adapter
   */
  private createDirectServiceAdapter<T extends V1Service>(
    serviceType: V1ServiceType,
    v2Service: any
  ): T {
    switch (serviceType) {
      case V1ServiceType.BROWSER:
        return this.createBrowserServiceAdapter(v2Service) as unknown as T;
      case V1ServiceType.PDF:
        return this.createPdfServiceAdapter(v2Service) as unknown as T;
      case V1ServiceType.VIDEO:
        return this.createVideoServiceAdapter(v2Service) as unknown as T;
      case V1ServiceType.AWS_S3:
        return this.createFileServiceAdapter(v2Service) as unknown as T;
      case V1ServiceType.TRANSCRIPTION:
        return this.createTranscriptionAdapter(v2Service) as unknown as T;
      default:
        // Generic adapter
        return this.createGenericAdapter(serviceType, v2Service) as T;
    }
  }

  /**
   * Create a browser service adapter
   * @param v2Service The V2 browser service
   * @returns A V1 browser service adapter
   */
  private createBrowserServiceAdapter(v2Service: any): V1IBrowserService {
    // Create an adapter that extends V1Service and implements V1IBrowserService
    const adapter = new BrowserServiceAdapter(this.runtime, v2Service);
    return adapter;
  }

  /**
   * Create a PDF service adapter
   * @param v2Service The V2 PDF service
   * @returns A V1 PDF service adapter
   */
  private createPdfServiceAdapter(v2Service: any): V1IPdfService {
    // Create an adapter that extends V1Service and implements V1IPdfService
    const adapter = new PdfServiceAdapter(this.runtime, v2Service);
    return adapter;
  }

  /**
   * Create a video service adapter
   * @param v2Service The V2 video service
   * @returns A V1 video service adapter
   */
  private createVideoServiceAdapter(v2Service: any): V1IVideoService {
    // Create an adapter that extends V1Service and implements V1IVideoService
    const adapter = new VideoServiceAdapter(this.runtime, v2Service);
    return adapter;
  }

  /**
   * Create a file service adapter (was AwsS3Service in V1)
   * @param v2Service The V2 file service
   * @returns A V1 file service adapter
   */
  private createFileServiceAdapter(v2Service: any): V1IAwsS3Service {
    // Create an adapter that extends V1Service and implements V1IAwsS3Service
    const adapter = new FileServiceAdapter(this.runtime, v2Service);
    return adapter;
  }

  /**
   * Create a transcription adapter
   * @param v2Service The V2 transcription service
   * @returns A V1 transcription adapter
   */
  private createTranscriptionAdapter(v2Service: any): V1ITranscriptionService {
    // Create an adapter that extends V1Service and implements V1ITranscriptionService
    const adapter = new TranscriptionServiceAdapter(this.runtime, v2Service);
    return adapter;
  }

  /**
   * Create a speech service adapter using V2 models
   * @returns A V1 speech service adapter
   */
  private createSpeechServiceAdapter(): V1ISpeechService {
    // Create an adapter that extends V1Service and implements V1ISpeechService
    const adapter = new SpeechServiceAdapter(this.runtime);
    return adapter;
  }

  /**
   * Create an image description adapter using V2 models
   * @returns A V1 image description adapter
   */
  private createImageDescriptionAdapter(): V1IImageDescriptionService {
    // Create an adapter that extends V1Service and implements V1IImageDescriptionService
    const adapter = new ImageDescriptionServiceAdapter(this.runtime);
    return adapter;
  }

  /**
   * Create a text generation adapter using V2 models
   * @returns A V1 text generation adapter
   */
  private createTextGenerationAdapter(): V1ITextGenerationService {
    // Create an adapter that extends V1Service and implements V1ITextGenerationService
    const adapter = new TextGenerationServiceAdapter(this.runtime);
    return adapter;
  }

  /**
   * Create a generic service adapter
   * @param serviceType The V1 service type
   * @param v2Service The V2 service
   * @returns A generic V1 service adapter
   */
  private createGenericAdapter(serviceType: V1ServiceType, v2Service: any): V1Service {
    // Create a generic adapter
    return new GenericServiceAdapter(this.runtime, v2Service, serviceType);
  }

  /**
   * Register a V1 service
   * @param serviceType The V1 service type
   * @param service The V1 service
   */
  registerService(serviceType: V1ServiceType, service: V1Service): void {
    this.services.set(serviceType, service);
  }
}

/**
 * Base adapter class that extends V1Service
 */
class BaseServiceAdapter extends V1Service {
  protected runtime: CompatAgentRuntime;
  protected v2Service: any;
  static serviceType: V1ServiceType;

  constructor(runtime: CompatAgentRuntime, v2Service: any = null) {
    super();
    this.runtime = runtime;
    this.v2Service = v2Service;
  }

  async initialize(_runtime: V1IAgentRuntime): Promise<void> {
    // If V2 service has a static start method, use it to properly initialize
    if (
      this.v2Service &&
      this.v2Service.constructor &&
      typeof this.v2Service.constructor.start === 'function'
    ) {
      try {
        console.log(`[Compat Layer] Starting V2 service using static start method`);
        this.v2Service = await this.v2Service.constructor.start(this.runtime._v2Runtime);
        console.log(`[Compat Layer] Successfully started V2 service`);
      } catch (error) {
        console.error(`[Compat Layer] Error starting V2 service:`, error);
      }
    }
    return Promise.resolve();
  }

  /**
   * Stop the service if possible
   * This handles V2 services that have a stop method
   */
  async stop(): Promise<void> {
    if (this.v2Service && typeof this.v2Service.stop === 'function') {
      try {
        await this.v2Service.stop();
        console.log(`[Compat Layer] Successfully stopped V2 service`);
      } catch (error) {
        console.error(`[Compat Layer] Error stopping V2 service:`, error);
      }
    }
    return Promise.resolve();
  }

  /**
   * Default implementation of getInstance
   * This ensures that V1 plugins can get the adapter instance
   */
  getInstance(): any {
    return this;
  }
}

/**
 * Browser service adapter
 */
class BrowserServiceAdapter extends BaseServiceAdapter implements V1IBrowserService {
  static serviceType = V1ServiceType.BROWSER;

  constructor(runtime: CompatAgentRuntime, v2Service: any) {
    super(runtime, v2Service);
  }

  async closeBrowser(): Promise<void> {
    if (this.v2Service) {
      if (typeof this.v2Service.stop === 'function') {
        return this.v2Service.stop();
      } else if (typeof this.v2Service.closeBrowser === 'function') {
        return this.v2Service.closeBrowser();
      }
    }
    return Promise.resolve();
  }

  async getPageContent(
    url: string,
    _runtime: V1IAgentRuntime
  ): Promise<{ title: string; description: string; bodyContent: string }> {
    if (!this.v2Service) {
      return {
        title: url,
        description: 'Browser service not available',
        bodyContent: '',
      };
    }

    try {
      return await this.v2Service.getPageContent(url, this.runtime._v2Runtime);
    } catch (error) {
      console.error('[Compat Layer] Error in getPageContent:', error);
      return {
        title: url,
        description: 'Error fetching content',
        bodyContent: '',
      };
    }
  }
}

/**
 * PDF service adapter
 */
class PdfServiceAdapter extends BaseServiceAdapter implements V1IPdfService {
  static serviceType = V1ServiceType.PDF;

  constructor(runtime: CompatAgentRuntime, v2Service: any) {
    super(runtime, v2Service);
  }

  async convertPdfToText(pdfBuffer: Buffer): Promise<string> {
    if (!this.v2Service) {
      return '';
    }

    try {
      return await this.v2Service.convertPdfToText(pdfBuffer);
    } catch (error) {
      console.error('[Compat Layer] Error in convertPdfToText:', error);
      return '';
    }
  }
}

/**
 * Video service adapter
 */
class VideoServiceAdapter extends BaseServiceAdapter implements V1IVideoService {
  static serviceType = V1ServiceType.VIDEO;

  constructor(runtime: CompatAgentRuntime, v2Service: any) {
    super(runtime, v2Service);
  }

  isVideoUrl(url: string): boolean {
    if (!this.v2Service) {
      // Fallback implementation
      return url.includes('youtube.com') || url.includes('vimeo.com') || url.includes('youtu.be');
    }
    return this.v2Service.isVideoUrl(url);
  }

  async fetchVideoInfo(url: string): Promise<any> {
    if (!this.v2Service) {
      throw new Error('Video service not available');
    }
    return this.v2Service.fetchVideoInfo(url);
  }

  async downloadVideo(videoInfo: any): Promise<string> {
    if (!this.v2Service) {
      throw new Error('Video service not available');
    }
    return this.v2Service.downloadVideo(videoInfo);
  }

  async processVideo(url: string, _runtime: V1IAgentRuntime): Promise<any> {
    if (!this.v2Service) {
      throw new Error('Video service not available');
    }
    return this.v2Service.processVideo(url, this.runtime._v2Runtime);
  }
}

/**
 * File service adapter (AWS S3)
 */
class FileServiceAdapter extends BaseServiceAdapter implements V1IAwsS3Service {
  static serviceType = V1ServiceType.AWS_S3;

  constructor(runtime: CompatAgentRuntime, v2Service: any) {
    super(runtime, v2Service);
  }

  async uploadFile(
    imagePath: string,
    subDirectory: string,
    useSignedUrl: boolean,
    expiresIn: number
  ): Promise<{
    success: boolean;
    url?: string;
    error?: string;
  }> {
    if (!this.v2Service) {
      return {
        success: false,
        error: 'File service not available',
      };
    }
    return this.v2Service.uploadFile(imagePath, subDirectory, useSignedUrl, expiresIn);
  }

  async generateSignedUrl(fileName: string, expiresIn: number): Promise<string> {
    if (!this.v2Service) {
      throw new Error('File service not available');
    }
    return this.v2Service.generateSignedUrl(fileName, expiresIn);
  }

  async uploadJson(
    jsonData: any,
    fileName?: string,
    subDirectory?: string,
    useSignedUrl: boolean = false,
    expiresIn: number = 900
  ): Promise<any> {
    if (!this.v2Service) {
      return {
        success: false,
        error: 'File service not available',
      };
    }

    if (typeof this.v2Service.uploadJson === 'function') {
      return this.v2Service.uploadJson(jsonData, fileName, subDirectory, useSignedUrl, expiresIn);
    }

    // Fallback implementation
    console.warn('[Compat Layer] uploadJson not available in V2 service, using fallback');
    const fs = require('fs');
    const tempFilePath = `/tmp/${fileName || Date.now()}.json`;
    fs.writeFileSync(tempFilePath, JSON.stringify(jsonData));

    try {
      const result = await this.v2Service.uploadFile(
        tempFilePath,
        subDirectory,
        useSignedUrl,
        expiresIn
      );

      // Clean up temp file
      fs.unlinkSync(tempFilePath);

      return {
        ...result,
        key: result.url ? result.url.split('/').pop() : undefined,
      };
    } catch (error) {
      // Clean up temp file
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}

      throw error;
    }
  }
}

/**
 * Transcription service adapter
 */
class TranscriptionServiceAdapter extends BaseServiceAdapter implements V1ITranscriptionService {
  static serviceType = V1ServiceType.TRANSCRIPTION;

  constructor(runtime: CompatAgentRuntime, v2Service: any) {
    super(runtime, v2Service);
  }

  async transcribeAttachment(audioBuffer: ArrayBuffer): Promise<string | null> {
    if (this.v2Service && typeof this.v2Service.transcribeAttachment === 'function') {
      return this.v2Service.transcribeAttachment(audioBuffer);
    }
    return this.transcribe(audioBuffer);
  }

  async transcribeAttachmentLocally(audioBuffer: ArrayBuffer): Promise<string | null> {
    if (this.v2Service && typeof this.v2Service.transcribeAttachmentLocally === 'function') {
      return this.v2Service.transcribeAttachmentLocally(audioBuffer);
    }
    return this.transcribeLocally(audioBuffer);
  }

  async transcribe(audioBuffer: ArrayBuffer): Promise<string | null> {
    if (this.v2Service && typeof this.v2Service.transcribe === 'function') {
      return this.v2Service.transcribe(audioBuffer);
    }

    // Fallback to using V2 runtime's transcription model
    try {
      return await this.runtime._v2Runtime.useModel(ModelType.TRANSCRIPTION, {
        audio: audioBuffer,
      });
    } catch (error) {
      console.error('[Compat Layer] Error in transcription:', error);
      return null;
    }
  }

  async transcribeLocally(audioBuffer: ArrayBuffer): Promise<string | null> {
    if (this.v2Service && typeof this.v2Service.transcribeLocally === 'function') {
      return this.v2Service.transcribeLocally(audioBuffer);
    }

    // Fallback to regular transcribe
    return this.transcribe(audioBuffer);
  }
}

/**
 * Speech service adapter
 */
class SpeechServiceAdapter extends BaseServiceAdapter implements V1ISpeechService {
  static serviceType = V1ServiceType.SPEECH_GENERATION;

  constructor(runtime: CompatAgentRuntime) {
    super(runtime);
  }

  async generate(_runtime: V1IAgentRuntime, text: string): Promise<Readable> {
    try {
      // Use V2 runtime's text-to-speech model
      const result = await this.runtime._v2Runtime.useModel(ModelType.TEXT_TO_SPEECH, {
        text: text,
      });

      // Convert the result to a Readable stream
      if (Buffer.isBuffer(result)) {
        const { Readable } = require('stream');
        const stream = new Readable();
        stream.push(result);
        stream.push(null);
        return stream;
      } else if (result instanceof Readable) {
        return result;
      }

      throw new Error('Unexpected return type from TEXT_TO_SPEECH model');
    } catch (error) {
      console.error('[Compat Layer] Error in speech generation:', error);
      throw error;
    }
  }
}

/**
 * Image description adapter
 */
class ImageDescriptionServiceAdapter
  extends BaseServiceAdapter
  implements V1IImageDescriptionService
{
  static serviceType = V1ServiceType.IMAGE_DESCRIPTION;

  constructor(runtime: CompatAgentRuntime) {
    super(runtime);
  }

  async describeImage(imageUrl: string): Promise<{ title: string; description: string }> {
    try {
      // Use V2 runtime's image description model
      const result = await this.runtime._v2Runtime.useModel(ModelType.IMAGE_DESCRIPTION, {
        imageUrl: imageUrl,
      });

      return result || { title: 'Image', description: 'No description available' };
    } catch (error) {
      console.error('[Compat Layer] Error in image description:', error);
      return { title: 'Error', description: 'Failed to describe image' };
    }
  }
}

/**
 * Text generation adapter
 */
class TextGenerationServiceAdapter extends BaseServiceAdapter implements V1ITextGenerationService {
  static serviceType = V1ServiceType.TEXT_GENERATION;

  constructor(runtime: CompatAgentRuntime) {
    super(runtime);
  }

  async initializeModel(): Promise<void> {
    // No-op in V2
    return Promise.resolve();
  }

  async queueMessageCompletion(
    context: string,
    temperature: number,
    stop: string[],
    frequency_penalty: number,
    presence_penalty: number,
    max_tokens: number
  ): Promise<any> {
    try {
      // Use V2 runtime's text generation model
      return await this.runtime._v2Runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: context,
        temperature,
        stopSequences: stop,
        frequencyPenalty: frequency_penalty,
        presencePenalty: presence_penalty,
        maxTokens: max_tokens,
      });
    } catch (error) {
      console.error('[Compat Layer] Error in text generation:', error);
      throw error;
    }
  }

  async queueTextCompletion(
    context: string,
    temperature: number,
    stop: string[],
    frequency_penalty: number,
    presence_penalty: number,
    max_tokens: number
  ): Promise<string> {
    try {
      // Use V2 runtime's text generation model
      return await this.runtime._v2Runtime.useModel(ModelType.TEXT_LARGE, {
        prompt: context,
        temperature,
        stopSequences: stop,
        frequencyPenalty: frequency_penalty,
        presencePenalty: presence_penalty,
        maxTokens: max_tokens,
      });
    } catch (error) {
      console.error('[Compat Layer] Error in text completion:', error);
      throw error;
    }
  }

  async getEmbeddingResponse(input: string): Promise<number[] | undefined> {
    try {
      // Use V2 runtime's embedding model
      return await this.runtime._v2Runtime.useModel(ModelType.TEXT_EMBEDDING, {
        text: input,
      });
    } catch (error) {
      console.error('[Compat Layer] Error in embedding generation:', error);
      return undefined;
    }
  }
}

/**
 * Generic service adapter
 */
class GenericServiceAdapter extends BaseServiceAdapter {
  private serviceTypeName: V1ServiceType;

  constructor(runtime: CompatAgentRuntime, v2Service: any, serviceType: V1ServiceType) {
    super(runtime, v2Service);
    this.serviceTypeName = serviceType;
  }

  // For static access to serviceType
  static get serviceType(): V1ServiceType {
    return this._serviceType;
  }

  // For storing the type on the instance
  static set serviceType(type: V1ServiceType) {
    this._serviceType = type;
  }

  private static _serviceType: V1ServiceType;
}

/**
 * Determine the service type from a service instance
 * @param service The service instance
 * @returns The service type or undefined
 */
export function determineServiceType(service: V1Service): V1ServiceType {
  if (!service) {
    throw new Error('Service is null or undefined');
  }

  // Check the static serviceType property
  const serviceClass = service.constructor as any;
  if (serviceClass?.serviceType) {
    return serviceClass.serviceType;
  }

  // Check if service has a property getter for serviceType
  if (service.serviceType !== undefined) {
    return service.serviceType;
  }

  // Check the instance serviceType property
  if ((service as any).serviceType) {
    return (service as any).serviceType;
  }

  // Check for interface-specific methods
  if ('isVideoUrl' in service && 'processVideo' in service) {
    return V1ServiceType.VIDEO;
  }

  if ('getPageContent' in service) {
    return V1ServiceType.BROWSER;
  }

  if ('convertPdfToText' in service) {
    return V1ServiceType.PDF;
  }

  if ('uploadFile' in service && 'generateSignedUrl' in service) {
    return V1ServiceType.AWS_S3;
  }

  if ('transcribe' in service || 'transcribeAttachment' in service) {
    return V1ServiceType.TRANSCRIPTION;
  }

  if ('queueTextCompletion' in service || 'getEmbeddingResponse' in service) {
    return V1ServiceType.TEXT_GENERATION;
  }

  if ('generate' in service && 'getInstance' in service) {
    return V1ServiceType.SPEECH_GENERATION;
  }

  if ('describeImage' in service) {
    return V1ServiceType.IMAGE_DESCRIPTION;
  }

  throw new Error(`Unable to determine service type for service: ${service.constructor.name}`);
}

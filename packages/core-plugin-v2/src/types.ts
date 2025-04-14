// packages/core-plugin-v2/src/types.ts

// Re-export all types needed by the functions and classes within core-plugin-v2
// Make sure to include *all* types that are used in the function signatures
// or class definitions within core-plugin-v2.
export type {
  Action,
  ActionExample,
  Agent,
  BaseMetadata,
  Character,
  Component,
  Content,
  CustomMetadata,
  DescriptionMetadata,
  DocumentMetadata,
  Entity,
  Evaluator,
  EvaluationExample,
  FragmentMetadata,
  Handler,
  HandlerCallback,
  IAgentRuntime,
  IDatabaseAdapter,
  KnowledgeItem,
  Log,
  Media,
  Memory,
  MemoryMetadata,
  MemoryScope, // Enum value used in BaseMetadata
  MemoryTypeAlias,
  MessageExample,
  MessageMetadata,
  ModelParamsMap,
  ModelResultMap,
  ModelTypeName,
  OnboardingConfig,
  Participant,
  Plugin,
  Project,
  ProjectAgent,
  Provider,
  ProviderResult,
  Relationship,
  Room,
  Route,
  RuntimeSettings,
  Service,
  ServiceTypeName,
  Setting,
  State, // Consider if EnhancedState is needed or if base State is enough
  Task,
  TaskWorker,
  TemplateType,
  UUID,
  Validator,
  World,
  WorldSettings,

  // Include interfaces for specific services if needed directly
  IVideoService,
  IBrowserService,
  IPdfService,
  IFileService,

  // Include specific parameter/result types if needed directly
  TextGenerationParams,
  TextEmbeddingParams,
  // ... other model param/result types if used directly in core-plugin-v2 code

  // Include event types if needed directly
  EventPayload,
  EventPayloadMap,
  EventHandler,
  MessageReceivedHandlerParams,
  // ... other specific event payload types

  // Include helper types/interfaces if needed
  ServiceError,
  TeeAgent,
  RemoteAttestationQuote,
  // ... others
} from '@elizaos/core';

// Re-export enums/consts used as values
export {
  ModelType,
  ServiceType,
  ChannelType,
  MemoryType, // Enum itself
  AgentStatus, // Enum itself
  Role, // Enum itself
  EventType,
  PlatformPrefix,
  SOCKET_MESSAGE_TYPE,
  TEEMode,
  TeeType,
  VECTOR_DIMS,
  CacheKeyPrefix,
  KnowledgeScope,
} from '@elizaos/core';

// Re-export helper functions if needed directly by consumers *of* core-plugin-v2
// (Usually, you'd wrap these if providing different functionality, but for direct pass-through):
export {
  asUUID,
  createMessageMemory,
  getTypedService,
  isDocumentMetadata,
  isFragmentMetadata,
  isMessageMetadata,
  isDescriptionMetadata,
  isCustomMetadata,
  getVideoService,
  getBrowserService,
  getPdfService,
  getFileService,
  isDocumentMemory,
  isFragmentMemory,
  getMemoryText,
  createServiceError,
} from '@elizaos/core';

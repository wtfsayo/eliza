import { logger as coreLogger, elizaLogger as coreElizaLogger } from '@elizaos/core-plugin-v2';

// Re-export the logger types and functions from v2
export { logger } from '@elizaos/core-plugin-v2';

// For backward compatibility
export const elizaLogger = coreElizaLogger;

// Default export for backward compatibility
export default coreLogger;

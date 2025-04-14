import { logger as coreLogger } from '@elizaos/core';

// Define the LogMethod type for the logger functions
type LogMethod = (...args: any[]) => void;

// logger wrapper/specification
const logger: Record<
  | 'trace'
  | 'debug'
  | 'success'
  | 'progress'
  | 'log'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal'
  | 'clear',
  LogMethod
> = {
  trace: function (...args: any[]) {
    return coreLogger.trace.apply(coreLogger, args);
  },
  debug: function (...args: any[]) {
    return coreLogger.debug.apply(coreLogger, args);
  },
  success: function (...args: any[]) {
    return coreLogger.success.apply(coreLogger, args);
  },
  progress: function (...args: any[]) {
    return coreLogger.progress.apply(coreLogger, args);
  },
  log: function (...args: any[]) {
    return coreLogger.log.apply(coreLogger, args);
  },
  info: function (...args: any[]) {
    return coreLogger.info.apply(coreLogger, args);
  },
  warn: function (...args: any[]) {
    return coreLogger.warn.apply(coreLogger, args);
  },
  error: function (...args: any[]) {
    return coreLogger.error.apply(coreLogger, args);
  },
  fatal: function (...args: any[]) {
    return coreLogger.fatal.apply(coreLogger, args);
  },
  // Fix the clear method - assuming it doesn't need parameters
  clear: function () {
    // @ts-ignore - if core implementation expects args but works without them
    return coreLogger.clear();
  },
};

export { logger };

// for backward compatibility
// we should deprecate this
export const elizaLogger = logger;

export default logger;

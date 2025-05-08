import { elizaLogger as coreLogger } from '@elizaos/core';
import type { LogFn } from 'pino';

// Use actual LogFn parameter types to avoid overload mismatch
type LogMethod = (inputArgs: Parameters<LogFn>) => void;

const logger: Record<
  | 'trace'
  | 'debug'
  | 'success'
  | 'progress'
  | 'log'
  | 'info'
  | 'warn'
  | 'error'
  | 'fatal',
  LogMethod
> & { clear: () => void } = {
  trace: (args) => coreLogger.trace(...args),
  debug: (args) => coreLogger.debug(...args),
  success: (args) => coreLogger.debug(...args),
  progress: (args) => coreLogger.debug(...args),
  log: (args) => coreLogger.info(...args),
  info: (args) => coreLogger.info(...args),
  warn: (args) => coreLogger.warn(...args),
  error: (args) => coreLogger.error(...args),
  fatal: (args) => coreLogger.fatal(...args),
  clear: () => coreLogger.clear(''), // call with dummy arg to satisfy "at least 1 argument" requirement
};

export { logger };
export const elizaLogger = logger;
export default logger;

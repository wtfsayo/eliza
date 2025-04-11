/**
 * Core Plugin V1 Compatibility Layer
 *
 * This package provides a compatibility layer for V1 plugins to work with the V2 runtime.
 * It translates between V1 and V2 types and handles any necessary adaptations.
 */

// Export types and core functionality from V1
export * from './types';
export * from './context';
export * from './generation';
export * from './messages';
export * from './posts';
export * from './runtime';

// TODO: Implement the remaining adapters:
// - action/handler
// - database
// - knowledge / memory
// - relationships

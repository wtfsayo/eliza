import { UUID as UUIDv1 } from './types';
import {
  stringToUuid as coreStringToUuid,
  validateUuid as coreValidateUuid,
} from '@elizaos/core/src/uuid';

/**
 * Represents a UUID string in the format "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 * This is a v1 compatibility wrapper for v2 UUID
 */
export type UUID = UUIDv1;

/**
 * Helper function to safely cast a string to strongly typed UUID
 * Wraps V2's validateUuid function
 *
 * @param id The string UUID to validate and cast
 * @returns The same UUID with branded type information
 * @throws Error if the UUID format is invalid
 */
export function asUUID(id: string): UUID {
  const validUuid = validateUuid(id);
  if (!validUuid) {
    throw new Error(`Invalid UUID format: ${id}`);
  }
  return id.toLowerCase() as UUID;
}

/**
 * Simple UUID generation function to replace the imported stringToUuid
 * Creates a UUID (v1 compatible) from an input string
 */
export function generateUuidFromString(input: string): UUID {
  return coreStringToUuid(input) as UUID;
}

/**
 * Validate if the given value is a valid UUID.
 * Wrapper around core validateUuid function
 */
export function validateUuid(value: unknown): UUID | null {
  return coreValidateUuid(value) as UUID | null;
}

/**
 * Convert a string to a UUID
 * Wrapper around core stringToUuid function
 */
export function stringToUuid(target: string | number): UUID {
  return coreStringToUuid(target) as UUID;
}

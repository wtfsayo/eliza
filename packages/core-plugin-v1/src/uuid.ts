import { UUID as UUIDv1 } from './types';

/**
 * Represents a UUID string in the format "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
 * This is a v1 compatibility wrapper for v2 UUID
 */
export type UUID = UUIDv1;

/**
 * Helper function to safely cast a string to strongly typed UUID
 * This is a v1 compatible wrapper for v2 asUUID function
 * Implemented locally to avoid external dependencies
 *
 * @param id The string UUID to validate and cast
 * @returns The same UUID with branded type information, normalized to lowercase
 */
export function asUUID(id: string): UUID {
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error(`Invalid UUID format: ${id}`);
  }
  // Normalize to lowercase for consistency
  return id.toLowerCase() as UUID;
}

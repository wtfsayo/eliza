import { createHash } from 'crypto';
import { UUID as V1UUID } from '../types';

/**
 * Simple UUID generation function to replace the imported stringToUuid
 * Creates a UUID (v1 compatible) from an input string using MD5 hash
 */
export function generateUuidFromString(input: string): V1UUID {
  const hash = createHash('md5').update(input).digest('hex');
  const uuid = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}-${hash.slice(16, 20)}-${hash.slice(20, 32)}`;
  return uuid as V1UUID;
}

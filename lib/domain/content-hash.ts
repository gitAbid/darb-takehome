import { createHash } from 'node:crypto';

/** SHA-256 of the file bytes, hex-encoded: the content identity used for dedupe and for fixture lookup. */
export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

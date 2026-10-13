import { timingSafeEqual } from 'node:crypto';

/** String equality whose duration does not depend on where the strings differ (lengths are not secret). */
export function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

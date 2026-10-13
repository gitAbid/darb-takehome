import type { ZodError } from 'zod';

import type { PayloadIssue } from './inbound-message';

/** Zod issues as `{ path, message }` pairs a provider (or a human) can act on. */
export function toPayloadIssues(error: ZodError): PayloadIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.') || '(root)', message: issue.message }));
}

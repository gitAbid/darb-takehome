import type { DocumentStatus } from '@/lib/domain/statuses';
import type { DocumentRepository } from '@/lib/repositories/document-repository';
import type { DocumentStatusChange } from '@/lib/repositories/records';

/** Allowed document transitions — IMPLEMENTATION.md §6.3. Anything else is a programming error. */
const TRANSITIONS: Readonly<Record<DocumentStatus, readonly DocumentStatus[]>> = {
  RECEIVED: ['EXTRACTED', 'FAILED'],
  EXTRACTED: ['MATCHED', 'NEEDS_REVIEW', 'UNMATCHED', 'FAILED'],
  NEEDS_REVIEW: ['MATCHED', 'UNMATCHED'],
  UNMATCHED: ['MATCHED', 'NEEDS_REVIEW'],
  MATCHED: [],
  FAILED: [],
};

export class IllegalTransitionError extends Error {
  constructor(from: DocumentStatus, to: DocumentStatus) {
    super(`Illegal document transition ${from} → ${to}`);
    this.name = 'IllegalTransitionError';
  }
}

export class StaleDocumentError extends Error {
  constructor(id: number, from: DocumentStatus) {
    super(`Document ${id} is no longer ${from}`);
    this.name = 'StaleDocumentError';
  }
}

/** The only way to change a document's status: validates the transition, then writes it guarded on the old status. */
export async function changeDocumentStatus(documents: DocumentRepository, change: DocumentStatusChange): Promise<void> {
  if (!TRANSITIONS[change.from].includes(change.to)) throw new IllegalTransitionError(change.from, change.to);
  if (!(await documents.changeStatus(change))) throw new StaleDocumentError(change.id, change.from);
}

export function canTransition(from: DocumentStatus, to: DocumentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

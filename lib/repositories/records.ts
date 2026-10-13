import type { CandidateFlag, ReasonCode } from '@/lib/domain/reason-codes';
import type { DocumentSource, DocumentStatus, MatchStatus } from '@/lib/domain/statuses';
import type { ExtractedDocument } from '@/lib/extraction/types';

/** A document as intake creates it: RECEIVED with a hash, or FAILED (e.g. media unavailable) without one. */
export interface NewDocument {
  source: DocumentSource;
  externalId: string;
  contentHash: string | null;
  senderIdentifier: string;
  recipientIdentifier: string | null;
  clientId: number | null;
  status: Extract<DocumentStatus, 'RECEIVED' | 'FAILED'>;
  failureReason: string | null;
  storageKey: string | null;
  mimeType: string;
}

/** What the extractor returned, as persisted on the document. */
export type ExtractionSnapshot = Omit<ExtractedDocument, 'documentDate'> & { documentDate: Date | null };

export interface StoredDocument extends Omit<NewDocument, 'status'> {
  id: number;
  status: DocumentStatus;
  decisionReasons: ReasonCode[];
  extraction: ExtractionSnapshot | null;
  receivedAt: Date;
}

/** A guarded status change: applied only if the document is still in `from`. */
export interface DocumentStatusChange {
  id: number;
  from: DocumentStatus;
  to: DocumentStatus;
  failureReason?: string;
  decisionReasons?: readonly ReasonCode[];
  extraction?: ExtractionSnapshot;
}

export interface NewMatch {
  transactionId: number;
  rank: number;
  confidence: number;
  signals: Record<string, number>;
  flags: readonly CandidateFlag[];
  status: MatchStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
}

export interface StoredMatch extends NewMatch {
  id: number;
  documentId: number;
}

/** A guarded reviewer decision: applied only if the match is still a CANDIDATE. */
export interface MatchDecision {
  id: number;
  to: Extract<MatchStatus, 'CONFIRMED' | 'REJECTED'>;
  decidedBy: string;
  decidedAt: Date;
}

export type InsertDocumentResult =
  { kind: 'created'; id: number } | { kind: 'duplicate'; field: 'externalId' | 'contentHash' };

export type MatchDecisionResult =
  | { kind: 'updated' }
  | { kind: 'stale' }
  | { kind: 'conflict'; field: 'confirmedTransactionId' | 'confirmedDocumentId' };

export interface CandidateQuery {
  clientIds: readonly number[];
  driverPhone: string | null;
  from: Date;
  to: Date;
}

export interface NewTransaction {
  externalRef: string;
  clientId: number;
  cardId: number;
  driverPhone: string | null;
  merchantName: string;
  mcc: string;
  amount: number;
  currency: string;
  transactionAt: Date;
}

export type InsertTransactionResult = { kind: 'created' | 'duplicate'; id: number };

/** UNMATCHED, extracted documents a new transaction could now explain. */
export interface UnmatchedDocumentQuery {
  clientId: number;
  driverPhone: string | null;
  /** Document-date range worth re-matching for this transaction. */
  from: Date;
  to: Date;
}

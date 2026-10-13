import type { CandidateFlag, ReasonCode } from '@/lib/domain/reason-codes';
import type { DocumentSource, DocumentStatus, MatchStatus } from '@/lib/domain/statuses';

import type { ExtractionSnapshot } from './records';

/** One row of the review queue: enough to triage without opening the document. */
export interface QueueItem {
  documentId: number;
  source: DocumentSource;
  senderIdentifier: string;
  receivedAt: Date;
  merchantName: string | null;
  totalAmount: number | null;
  currency: string | null;
  documentDate: Date | null;
  reasons: ReasonCode[];
  pendingCandidates: number;
}

export interface ReviewCandidate {
  matchId: number;
  rank: number;
  confidence: number;
  signals: Record<string, number>;
  flags: readonly CandidateFlag[];
  status: MatchStatus;
  transaction: {
    id: number;
    merchantName: string;
    mcc: string;
    amount: number;
    currency: string;
    transactionAt: Date;
    cardLast4: string;
    cardLabel: string;
    driverPhone: string | null;
  };
}

/** Everything a reviewer needs to decide one document. */
export interface ReviewDocument {
  documentId: number;
  status: DocumentStatus;
  source: DocumentSource;
  senderIdentifier: string;
  recipientIdentifier: string | null;
  receivedAt: Date;
  mimeType: string;
  hasFile: boolean;
  extraction: ExtractionSnapshot | null;
  reasons: ReasonCode[];
  candidates: ReviewCandidate[];
}

/** Read model for the review UI (queries only; decisions go through ReviewService). */
export interface ReviewQueueReader {
  /** NEEDS_REVIEW documents, oldest first (first in, first reviewed). */
  listQueue(limit: number): Promise<QueueItem[]>;
  findDocument(documentId: number): Promise<ReviewDocument | null>;
  countByStatus(): Promise<Record<DocumentStatus, number>>;
}

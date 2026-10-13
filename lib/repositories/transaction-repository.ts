import type { CandidateTransaction } from '@/lib/services/matching/types';

import type { CandidateQuery, InsertTransactionResult, NewTransaction } from './records';

export interface TransactionRepository {
  /** In-scope transactions in [from, to], with card last4 and whether a document is already confirmed. */
  findCandidates(query: CandidateQuery): Promise<CandidateTransaction[]>;
  /** Idempotent on externalRef: a redelivered transaction returns the existing id as a duplicate. */
  insert(transaction: NewTransaction): Promise<InsertTransactionResult>;
  cardBelongsToClient(cardId: number, clientId: number): Promise<boolean>;
}

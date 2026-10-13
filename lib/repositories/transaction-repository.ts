import type { CandidateTransaction } from '@/lib/services/matching/types';

import type { CandidateQuery } from './records';

export interface TransactionRepository {
  /** In-scope transactions in [from, to], with card last4 and whether a document is already confirmed. */
  findCandidates(query: CandidateQuery): Promise<CandidateTransaction[]>;
}

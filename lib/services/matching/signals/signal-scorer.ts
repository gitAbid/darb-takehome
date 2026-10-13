import type { CandidateFlag } from '@/lib/domain/reason-codes';

import type { CandidateTransaction, PreparedDocument, SignalName } from '../types';

export interface SignalScore {
  /** 0..1 */
  value: number;
  flag?: CandidateFlag;
}

/** Measures one aspect of similarity. Returns null when it cannot be measured (e.g. no card digits on the receipt). */
export interface SignalScorer {
  readonly name: SignalName;
  score(doc: PreparedDocument, transaction: CandidateTransaction): SignalScore | null;
}

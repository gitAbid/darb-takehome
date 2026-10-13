import { createDefaultMatcher } from './matching/default-matcher';
import type { MatchDocumentFn } from './matching/types';

export type {
  CandidateTransaction,
  ExtractedFields,
  MatchCandidate,
  MatchOutcome,
  MatchResult,
  SenderScope,
} from './matching/types';

/** Pure function: no I/O — takes the document + candidate transactions. */
export const matchDocument: MatchDocumentFn = createDefaultMatcher();

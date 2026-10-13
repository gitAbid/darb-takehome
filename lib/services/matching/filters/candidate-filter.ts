import type { CandidateTransaction, FilterName, PreparedDocument } from '../types';

/** A hard rule: a transaction that fails it can never be this document's match. */
export interface CandidateFilter {
  readonly name: FilterName;
  accepts(doc: PreparedDocument, transaction: CandidateTransaction): boolean;
}

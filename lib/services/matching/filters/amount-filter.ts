import type { AmountRules } from '../matching-config';
import { classifyAmount } from '../signals/amount-classifier';
import type { CandidateTransaction, FilterName, PreparedDocument } from '../types';
import type { CandidateFilter } from './candidate-filter';

/** Removes transactions whose amount cannot be this document's (not exact, not a tip, not near). */
export class AmountFilter implements CandidateFilter {
  readonly name: FilterName = 'amount';

  constructor(private readonly rules: AmountRules) {}

  accepts(doc: PreparedDocument, transaction: CandidateTransaction): boolean {
    return classifyAmount(doc.amount, transaction.amount, transaction.mcc, this.rules) !== 'NONE';
  }
}

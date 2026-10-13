import { compareLast4 } from '../signals/card-comparison';
import type { CandidateTransaction, FilterName, PreparedDocument } from '../types';
import type { CandidateFilter } from './candidate-filter';

/** Removes transactions on a clearly different card (two or more of the last 4 digits differ). */
export class CardFilter implements CandidateFilter {
  readonly name: FilterName = 'card';

  accepts(doc: PreparedDocument, transaction: CandidateTransaction): boolean {
    return compareLast4(doc.fields.cardLast4, transaction.cardLast4) !== 'DIFFERENT';
  }
}

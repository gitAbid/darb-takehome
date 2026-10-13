import type { CandidateTransaction, FilterName, PreparedDocument } from '../types';
import type { CandidateFilter } from './candidate-filter';

/** Removes transactions in a different currency; a document without a currency is not filtered. */
export class CurrencyFilter implements CandidateFilter {
  readonly name: FilterName = 'currency';

  accepts(doc: PreparedDocument, transaction: CandidateTransaction): boolean {
    const documentCurrency = doc.fields.currency?.trim().toUpperCase();
    if (!documentCurrency) return true;
    return documentCurrency === transaction.currency.trim().toUpperCase();
  }
}

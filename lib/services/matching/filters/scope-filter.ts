import type { CandidateTransaction, FilterName, PreparedDocument } from '../types';
import type { CandidateFilter } from './candidate-filter';

/** Keeps only the sender's client(s) and, for WhatsApp, only that driver's transactions. */
export class ScopeFilter implements CandidateFilter {
  readonly name: FilterName = 'scope';

  accepts(doc: PreparedDocument, transaction: CandidateTransaction): boolean {
    const { clientIds, driverPhone } = doc.fields.scope;
    if (!clientIds.includes(transaction.clientId)) return false;
    return driverPhone === null || transaction.driverPhone === driverPhone;
  }
}

import type { DateRules } from '../matching-config';
import { dayGap } from '../prepared-document';
import type { CandidateTransaction, FilterName, PreparedDocument } from '../types';
import type { CandidateFilter } from './candidate-filter';

/** Removes transactions outside the plausible day range for this document type. */
export class DateWindowFilter implements CandidateFilter {
  readonly name: FilterName = 'dateWindow';

  constructor(private readonly rules: Pick<DateRules, 'windows'>) {}

  accepts(doc: PreparedDocument, transaction: CandidateTransaction): boolean {
    const gap = dayGap(doc, transaction);
    if (gap === null) return false;
    const window = this.rules.windows[doc.documentType];
    return gap >= window.minDays && gap <= window.maxDays;
  }
}

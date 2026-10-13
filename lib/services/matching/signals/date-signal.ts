import type { DateRules } from '../matching-config';
import { dayGap } from '../prepared-document';
import type { CandidateTransaction, PreparedDocument, SignalName } from '../types';
import type { SignalScore, SignalScorer } from './signal-scorer';

export class DateSignal implements SignalScorer {
  readonly name: SignalName = 'date';

  constructor(private readonly rules: Pick<DateRules, 'scores' | 'fallbackScore'>) {}

  score(doc: PreparedDocument, transaction: CandidateTransaction): SignalScore | null {
    const gap = dayGap(doc, transaction);
    if (gap === null) return null;
    const step = this.rules.scores.find(({ maxGapDays }) => Math.abs(gap) <= maxGapDays);
    return { value: step?.score ?? this.rules.fallbackScore };
  }
}

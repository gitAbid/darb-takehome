import type { CardRules } from '../matching-config';
import type { CandidateTransaction, PreparedDocument, SignalName } from '../types';
import { compareLast4 } from './card-comparison';
import type { SignalScore, SignalScorer } from './signal-scorer';

export class CardSignal implements SignalScorer {
  readonly name: SignalName = 'card';

  constructor(private readonly rules: CardRules) {}

  score(doc: PreparedDocument, transaction: CandidateTransaction): SignalScore | null {
    switch (compareLast4(doc.fields.cardLast4, transaction.cardLast4)) {
      case 'ABSENT':
        return null;
      case 'EQUAL':
        return { value: 1 };
      case 'ONE_DIGIT':
        return { value: this.rules.possibleMisreadScore, flag: 'CARD_POSSIBLE_MISREAD' };
      case 'DIFFERENT':
        return { value: 0 };
    }
  }
}

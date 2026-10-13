import type { AmountRules } from '../matching-config';
import type { CandidateTransaction, PreparedDocument, SignalName } from '../types';
import { classifyAmount } from './amount-classifier';
import type { SignalScore, SignalScorer } from './signal-scorer';

export class AmountSignal implements SignalScorer {
  readonly name: SignalName = 'amount';

  constructor(private readonly rules: AmountRules) {}

  score(doc: PreparedDocument, transaction: CandidateTransaction): SignalScore {
    switch (classifyAmount(doc.amount, transaction.amount, transaction.mcc, this.rules)) {
      case 'EXACT':
        return { value: 1 };
      case 'TIP':
        return { value: this.rules.tipScore, flag: 'AMOUNT_TIP_TOLERANCE' };
      case 'NEAR':
        return { value: this.rules.nearScore };
      case 'NONE':
        return { value: 0 };
    }
  }
}

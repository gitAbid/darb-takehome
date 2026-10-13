import type { MerchantNormalizer } from '../text/merchant-normalizer';
import type { StringSimilarity } from '../text/string-similarity';
import type { CandidateTransaction, PreparedDocument, SignalName } from '../types';
import type { SignalScore, SignalScorer } from './signal-scorer';

export class MerchantSignal implements SignalScorer {
  readonly name: SignalName = 'merchant';

  constructor(
    private readonly normalizer: MerchantNormalizer,
    private readonly similarity: StringSimilarity,
  ) {}

  score(doc: PreparedDocument, transaction: CandidateTransaction): SignalScore | null {
    if (doc.merchantTokens === null) return null;
    const transactionTokens = this.normalizer.normalize(transaction.merchantName);
    return { value: this.similarity.similarity(doc.merchantTokens, transactionTokens) };
  }
}

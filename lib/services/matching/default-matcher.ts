import { GatedDecisionPolicy } from './decision/gated-decision-policy';
import { AmountFilter } from './filters/amount-filter';
import { CardFilter } from './filters/card-filter';
import { CurrencyFilter } from './filters/currency-filter';
import { DateWindowFilter } from './filters/date-window-filter';
import { ScopeFilter } from './filters/scope-filter';
import { createMatcher } from './matcher';
import { defaultMatchingConfig, type MatchingConfig } from './matching-config';
import { AmountSignal } from './signals/amount-signal';
import { CardSignal } from './signals/card-signal';
import { DateSignal } from './signals/date-signal';
import { MerchantSignal } from './signals/merchant-signal';
import { ScopeSignal } from './signals/scope-signal';
import { DefaultMerchantNormalizer } from './text/default-merchant-normalizer';
import type { MerchantNormalizer } from './text/merchant-normalizer';
import type { StringSimilarity } from './text/string-similarity';
import { TokenDiceSimilarity } from './text/token-dice-similarity';
import type { MatchDocumentFn } from './types';

export interface TextTools {
  normalizer: MerchantNormalizer;
  similarity: StringSimilarity;
}

/** Wires the standard filters, signals and gated policy. Swap any part by passing a different config or text tools. */
export function createDefaultMatcher(
  config: MatchingConfig = defaultMatchingConfig,
  text: TextTools = { normalizer: new DefaultMerchantNormalizer(), similarity: new TokenDiceSimilarity() },
): MatchDocumentFn {
  return createMatcher({
    normalizer: text.normalizer,
    filters: [
      new ScopeFilter(),
      new CurrencyFilter(),
      new DateWindowFilter(config.date),
      new AmountFilter(config.amount),
      new CardFilter(),
    ],
    scorers: [
      new AmountSignal(config.amount),
      new DateSignal(config.date),
      new MerchantSignal(text.normalizer, text.similarity),
      new CardSignal(config.card),
      new ScopeSignal(),
    ],
    weights: config.weights,
    policy: new GatedDecisionPolicy(config),
  });
}

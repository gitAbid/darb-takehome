import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import { AmountSignal } from '@/lib/services/matching/signals/amount-signal';
import { CardSignal } from '@/lib/services/matching/signals/card-signal';
import { DateSignal } from '@/lib/services/matching/signals/date-signal';
import { MerchantSignal } from '@/lib/services/matching/signals/merchant-signal';
import { ScopeSignal } from '@/lib/services/matching/signals/scope-signal';
import { DefaultMerchantNormalizer } from '@/lib/services/matching/text/default-merchant-normalizer';
import { TokenDiceSimilarity } from '@/lib/services/matching/text/token-dice-similarity';

import { buildPrepared, buildTransaction } from '../../helpers/matching-builders';

const config = defaultMatchingConfig;

describe('AmountSignal', () => {
  const signal = new AmountSignal(config.amount);

  it('scores exact 1, tip 0.7 with a flag, near 0.5, none 0', () => {
    expect(signal.score(buildPrepared(), buildTransaction())).toEqual({ value: 1 });
    expect(signal.score(buildPrepared({ totalAmount: 5750 }), buildTransaction({ amount: 6325, mcc: '5812' }))).toEqual(
      { value: 0.7, flag: 'AMOUNT_TIP_TOLERANCE' },
    );
    expect(signal.score(buildPrepared(), buildTransaction({ amount: 15100 }))).toEqual({ value: 0.5 });
    expect(signal.score(buildPrepared(), buildTransaction({ amount: 99900 }))).toEqual({ value: 0 });
  });
});

describe('DateSignal', () => {
  const signal = new DateSignal(config.date);
  const scoreForGap = (days: number) =>
    signal.score(
      buildPrepared({ documentDate: '2025-06-20' }),
      buildTransaction({ transactionAt: new Date(Date.UTC(2025, 5, 20 - days, 9)) }),
    )?.value;

  it.each([
    [0, 1],
    [1, 0.8],
    [-1, 0.8],
    [2, 0.6],
    [3, 0.4],
    [-3, 0.4],
    [5, 0.2],
    [7, 0.2],
    [8, 0.1],
    [25, 0.1],
  ])('gap %p days → %p', (gap, expected) => {
    expect(scoreForGap(gap)).toBe(expected);
  });

  it('is not measurable for an invalid transaction date', () => {
    expect(signal.score(buildPrepared(), buildTransaction({ transactionAt: new Date('x') }))).toBeNull();
  });
});

describe('MerchantSignal', () => {
  const signal = new MerchantSignal(new DefaultMerchantNormalizer(), new TokenDiceSimilarity());

  it('scores the acquirer string against the receipt name', () => {
    expect(signal.score(buildPrepared({ merchantName: 'Alfanar Fuel Station' }), buildTransaction())?.value).toBe(1);
    expect(signal.score(buildPrepared({ merchantName: 'Rawabi Fuel' }), buildTransaction())?.value).toBeLessThan(0.3);
  });

  it('is not measurable when the receipt has no usable merchant name', () => {
    expect(signal.score(buildPrepared({ merchantName: null }), buildTransaction())).toBeNull();
    expect(signal.score(buildPrepared({ merchantName: '#04 RUH' }), buildTransaction())).toBeNull();
  });

  it('scores 0 when the acquirer string normalizes to nothing', () => {
    expect(signal.score(buildPrepared(), buildTransaction({ merchantName: 'ST 04 RUH' }))?.value).toBe(0);
  });
});

describe('CardSignal', () => {
  const signal = new CardSignal(config.card);

  it('scores equal 1, a one-digit misread 0.3 with a flag, and a different card 0', () => {
    expect(signal.score(buildPrepared({ cardLast4: '4471' }), buildTransaction())).toEqual({ value: 1 });
    expect(signal.score(buildPrepared({ cardLast4: '4477' }), buildTransaction())).toEqual({
      value: 0.3,
      flag: 'CARD_POSSIBLE_MISREAD',
    });
    expect(signal.score(buildPrepared({ cardLast4: '9902' }), buildTransaction())).toEqual({ value: 0 });
  });

  it('is not measurable when the receipt shows no card', () => {
    expect(signal.score(buildPrepared({ cardLast4: null }), buildTransaction())).toBeNull();
  });
});

describe('ScopeSignal', () => {
  it('always records 1 for in-scope survivors', () => {
    expect(new ScopeSignal().score()).toEqual({ value: 1 });
  });
});

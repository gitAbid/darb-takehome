/** Boundary rules of the matcher's building blocks (IMPLEMENTATION.md §3.3–§3.4). */
import { DateWindowFilter } from '@/lib/services/matching/filters/date-window-filter';
import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import { rankCandidates } from '@/lib/services/matching/ranking';
import { roundScore, scoreCandidate } from '@/lib/services/matching/scoring';
import { classifyAmount } from '@/lib/services/matching/signals/amount-classifier';
import { AmountSignal } from '@/lib/services/matching/signals/amount-signal';
import { compareLast4 } from '@/lib/services/matching/signals/card-comparison';
import { CardSignal } from '@/lib/services/matching/signals/card-signal';
import { DateSignal } from '@/lib/services/matching/signals/date-signal';
import { MerchantSignal } from '@/lib/services/matching/signals/merchant-signal';
import type { SignalScorer } from '@/lib/services/matching/signals/signal-scorer';
import { DefaultMerchantNormalizer } from '@/lib/services/matching/text/default-merchant-normalizer';
import { TokenDiceSimilarity } from '@/lib/services/matching/text/token-dice-similarity';
import type { ScoredCandidate, SignalName } from '@/lib/services/matching/types';

import { buildPrepared, buildTransaction } from '../../helpers/matching-builders';

const config = defaultMatchingConfig;
const at = (iso: string) => buildTransaction({ transactionAt: new Date(iso) });

describe('date window filter', () => {
  const filter = new DateWindowFilter(config.date);

  it('accepts a receipt from 3 days before to 1 day after the transaction (−3…+1)', () => {
    const receipt = buildPrepared({ documentDate: '2025-06-10' });
    expect(filter.accepts(receipt, at('2025-06-13T08:00:00Z'))).toBe(true);
    expect(filter.accepts(receipt, at('2025-06-14T08:00:00Z'))).toBe(false);
    expect(filter.accepts(receipt, at('2025-06-09T08:00:00Z'))).toBe(true);
    expect(filter.accepts(receipt, at('2025-06-08T08:00:00Z'))).toBe(false);
    expect(filter.accepts(receipt, buildTransaction({ transactionAt: new Date('invalid') }))).toBe(false);
  });

  it('accepts a tax invoice issued up to 30 days after the purchase (−1…+30)', () => {
    const invoice = buildPrepared({ documentType: 'TAX_INVOICE', documentDate: '2025-06-10' });
    expect(filter.accepts(invoice, at('2025-05-11T08:00:00Z'))).toBe(true);
    expect(filter.accepts(invoice, at('2025-05-10T08:00:00Z'))).toBe(false);
    expect(filter.accepts(invoice, at('2025-06-11T08:00:00Z'))).toBe(true);
    expect(filter.accepts(invoice, at('2025-06-12T08:00:00Z'))).toBe(false);
  });
});

describe('amount rules', () => {
  const classify = (receipt: number, charged: number, mcc = '5541') =>
    classifyAmount(receipt, charged, mcc, config.amount);

  it('is EXACT within 5 halalas of VAT rounding and NEAR within 1 %, in either direction', () => {
    expect([classify(10000, 10004), classify(10000, 9995)]).toEqual(['EXACT', 'EXACT']);
    expect([classify(15000, 15100), classify(15000, 14850)]).toEqual(['NEAR', 'NEAR']);
    expect([classify(5000, 4900), classify(15000, Number.NaN)]).toEqual(['NONE', 'NONE']);
  });

  it('allows a tip only at restaurants, only upwards, and only up to 20 %', () => {
    expect(classify(5750, 6325, '5812')).toBe('TIP'); // brief's example: 57.50 → 63.25
    expect(classify(5000, 6000, '5814')).toBe('TIP'); // boundary
    expect(classify(5000, 6100, '5812')).toBe('NONE'); // above 20 %
    expect(classify(5000, 5500, '5541')).toBe('NONE'); // fuel station
    expect(classify(5750, 5000, '5812')).toBe('NONE'); // charged less
  });

  it('scores exact 1, tip 0.7 with a flag, near 0.5', () => {
    const signal = new AmountSignal(config.amount);
    expect(signal.score(buildPrepared(), buildTransaction())).toEqual({ value: 1 });
    expect(signal.score(buildPrepared({ totalAmount: 5750 }), buildTransaction({ amount: 6325, mcc: '5812' }))).toEqual(
      {
        value: 0.7,
        flag: 'AMOUNT_TIP_TOLERANCE',
      },
    );
    expect(signal.score(buildPrepared(), buildTransaction({ amount: 15100 }))).toEqual({ value: 0.5 });
    expect(signal.score(buildPrepared(), buildTransaction({ amount: 99900 }))).toEqual({ value: 0 });
  });
});

describe('card rules', () => {
  it('compares last4 as equal, one-digit misread, different card, or absent', () => {
    expect(compareLast4(' 4471 ', '4471')).toBe('EQUAL');
    expect(compareLast4('4477', '4471')).toBe('ONE_DIGIT');
    expect(compareLast4('4417', '4471')).toBe('DIFFERENT');
    for (const absent of [null, '', '447', '44a1', '44711']) expect(compareLast4(absent, '4471')).toBe('ABSENT');
    expect(compareLast4('4471', null)).toBe('ABSENT');
  });

  it('scores equal 1, a misread 0.3 with a flag, and is not measurable without card digits', () => {
    const signal = new CardSignal(config.card);
    expect(signal.score(buildPrepared({ cardLast4: '4471' }), buildTransaction())).toEqual({ value: 1 });
    expect(signal.score(buildPrepared({ cardLast4: '4477' }), buildTransaction())).toEqual({
      value: 0.3,
      flag: 'CARD_POSSIBLE_MISREAD',
    });
    expect(signal.score(buildPrepared({ cardLast4: '9902' }), buildTransaction())).toEqual({ value: 0 });
    expect(signal.score(buildPrepared({ cardLast4: null }), buildTransaction())).toBeNull();
  });
});

describe('date and merchant signals', () => {
  it('decays with the day gap: 1 · 0.8 · 0.6 · 0.4 · 0.2 (≤7 days) · 0.1 beyond', () => {
    const signal = new DateSignal(config.date);
    const scoreForGap = (days: number) =>
      signal.score(
        buildPrepared({ documentDate: '2025-06-20' }),
        buildTransaction({ transactionAt: new Date(Date.UTC(2025, 5, 20 - days, 9)) }),
      )?.value;
    expect([0, 1, -1, 2, 3, 7, 8, 25].map(scoreForGap)).toEqual([1, 0.8, 0.8, 0.6, 0.4, 0.2, 0.1, 0.1]);
    expect(signal.score(buildPrepared(), buildTransaction({ transactionAt: new Date('x') }))).toBeNull();
  });

  it('compares the acquirer string with the receipt name; not measurable without a usable name', () => {
    const signal = new MerchantSignal(new DefaultMerchantNormalizer(), new TokenDiceSimilarity());
    expect(signal.score(buildPrepared({ merchantName: 'Alfanar Fuel Station' }), buildTransaction())?.value).toBe(1);
    expect(signal.score(buildPrepared({ merchantName: 'Rawabi Fuel' }), buildTransaction())?.value).toBeLessThan(0.3);
    expect(signal.score(buildPrepared({ merchantName: null }), buildTransaction())).toBeNull();
    expect(signal.score(buildPrepared({ merchantName: '#04 RUH' }), buildTransaction())).toBeNull();
    expect(signal.score(buildPrepared(), buildTransaction({ merchantName: 'ST 04 RUH' }))?.value).toBe(0);
  });
});

describe('scoring and ranking', () => {
  const fixed = (name: SignalName, value: number | null): SignalScorer => ({
    name,
    score: () => (value === null ? null : { value }),
  });

  it('averages only measurable signals by weight, so a missing card is no penalty (S12 → 0.95)', () => {
    const scorers = [
      fixed('amount', 1),
      fixed('date', 0.8),
      fixed('merchant', 1),
      fixed('card', null),
      fixed('scope', 1),
    ];
    const scored = scoreCandidate(
      buildPrepared({ documentDate: '2025-06-12' }),
      buildTransaction(),
      scorers,
      config.weights,
    );
    expect(scored).toMatchObject({
      confidence: 0.95,
      signals: { amount: 1, date: 0.8, merchant: 1, scope: 1 },
      dayGap: 2,
    });
    expect(scoreCandidate(buildPrepared(), buildTransaction(), [fixed('scope', 1)], config.weights).confidence).toBe(0);
    const invalidDate = buildTransaction({ transactionAt: new Date('x') });
    expect(scoreCandidate(buildPrepared(), invalidDate, [], config.weights).dayGap).toBe(Infinity);
  });

  it('clamps scores to [0, 1] and rounds to 4 decimals', () => {
    expect([0.123456, 0.88000000001, 1.4, -0.2, Number.NaN, Infinity].map(roundScore)).toEqual([
      0.1235, 0.88, 1, 0, 0, 0,
    ]);
  });

  it('ranks by confidence, then closer date, then earlier time, then lower id — without mutating input', () => {
    const candidate = (
      id: number,
      confidence: number,
      dayGap: number,
      iso = '2025-06-10T08:00:00Z',
    ): ScoredCandidate => ({
      transaction: buildTransaction({ id, transactionAt: new Date(iso) }),
      confidence,
      signals: {},
      flags: [],
      dayGap,
    });
    const input = [
      candidate(5, 0.9, 0, '2025-06-10T09:00:00Z'),
      candidate(4, 0.9, 0),
      candidate(3, 0.9, -1),
      candidate(2, 0.95, 3),
      candidate(1, 0.9, 0),
      candidate(7, 0.5, Infinity),
      candidate(6, 0.5, Infinity),
    ];
    expect(rankCandidates(input).map((c) => c.transaction.id)).toEqual([2, 1, 4, 5, 3, 6, 7]);
    expect(input[0].transaction.id).toBe(5);
  });
});

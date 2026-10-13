import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import { rankCandidates } from '@/lib/services/matching/ranking';
import { roundScore, scoreCandidate } from '@/lib/services/matching/scoring';
import type { SignalScorer } from '@/lib/services/matching/signals/signal-scorer';
import type { ScoredCandidate, SignalName } from '@/lib/services/matching/types';

import { buildPrepared, buildTransaction } from '../../helpers/matching-builders';

const weights = defaultMatchingConfig.weights;

function fixedScorer(name: SignalName, value: number | null, flag?: 'AMOUNT_TIP_TOLERANCE'): SignalScorer {
  return { name, score: () => (value === null ? null : { value, flag }) };
}

describe('scoreCandidate', () => {
  it('computes the weighted average of all present signals (S03: tip receipt → 0.88)', () => {
    const scorers = [
      fixedScorer('amount', 0.7, 'AMOUNT_TIP_TOLERANCE'),
      fixedScorer('date', 1),
      fixedScorer('merchant', 1),
      fixedScorer('card', 1),
      fixedScorer('scope', 1),
    ];
    const scored = scoreCandidate(buildPrepared(), buildTransaction(), scorers, weights);
    expect(scored.confidence).toBe(0.88);
    expect(scored.signals).toEqual({ amount: 0.7, date: 1, merchant: 1, card: 1, scope: 1 });
    expect(scored.flags).toEqual(['AMOUNT_TIP_TOLERANCE']);
  });

  it('renormalizes over measurable signals only — a missing card is not a penalty (S12: 0.95)', () => {
    const scorers = [
      fixedScorer('amount', 1),
      fixedScorer('date', 0.8),
      fixedScorer('merchant', 1),
      fixedScorer('card', null),
    ];
    const scored = scoreCandidate(buildPrepared(), buildTransaction(), scorers, weights);
    expect(scored.confidence).toBe(0.95);
    expect(scored.signals).not.toHaveProperty('card');
  });

  it('scores 0 when nothing weighted is measurable', () => {
    const scored = scoreCandidate(buildPrepared(), buildTransaction(), [fixedScorer('scope', 1)], weights);
    expect(scored.confidence).toBe(0);
  });

  it('records the day gap, or Infinity when the transaction date is invalid', () => {
    const doc = buildPrepared({ documentDate: '2025-06-12' });
    expect(scoreCandidate(doc, buildTransaction(), [], weights).dayGap).toBe(2);
    expect(scoreCandidate(doc, buildTransaction({ transactionAt: new Date('x') }), [], weights).dayGap).toBe(Infinity);
  });
});

describe('roundScore', () => {
  it.each([
    [0.123456, 0.1235],
    [0.88000000001, 0.88],
    [1.4, 1],
    [-0.2, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])('%p → %p', (input, expected) => {
    expect(roundScore(input)).toBe(expected);
  });
});

describe('rankCandidates', () => {
  const candidate = (id: number, confidence: number, dayGap: number, at = '2025-06-10T08:00:00Z'): ScoredCandidate => ({
    transaction: buildTransaction({ id, transactionAt: new Date(at) }),
    confidence,
    signals: {},
    flags: [],
    dayGap,
  });

  it('orders by confidence, then closer date, then earlier time, then lower id', () => {
    const ranked = rankCandidates([
      candidate(5, 0.9, 0, '2025-06-10T09:00:00Z'),
      candidate(4, 0.9, 0, '2025-06-10T08:00:00Z'),
      candidate(3, 0.9, -1),
      candidate(2, 0.95, 3),
      candidate(1, 0.9, 0, '2025-06-10T08:00:00Z'),
    ]);
    expect(ranked.map((c) => c.transaction.id)).toEqual([2, 1, 4, 5, 3]);
  });

  it('does not mutate its input', () => {
    const input = [candidate(1, 0.5, 0), candidate(2, 0.9, 0)];
    rankCandidates(input);
    expect(input.map((c) => c.transaction.id)).toEqual([1, 2]);
  });

  it('keeps a deterministic order when day gaps are Infinity', () => {
    const ranked = rankCandidates([candidate(2, 0.7, Infinity), candidate(1, 0.7, Infinity)]);
    expect(ranked.map((c) => c.transaction.id)).toEqual([1, 2]);
  });
});

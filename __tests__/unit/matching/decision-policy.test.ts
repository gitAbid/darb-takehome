/** The auto-match gates and unmatched outcomes (IMPLEMENTATION.md §3.5–§3.6). */
import { GatedDecisionPolicy } from '@/lib/services/matching/decision/gated-decision-policy';
import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import type { ScoredCandidate } from '@/lib/services/matching/types';

import { buildPrepared, buildTransaction } from '../../helpers/matching-builders';

const policy = new GatedDecisionPolicy(defaultMatchingConfig);
const doc = buildPrepared();

function candidate(overrides: Partial<ScoredCandidate> = {}, id = 1): ScoredCandidate {
  return {
    transaction: buildTransaction({ id }),
    confidence: 1,
    signals: { amount: 1, date: 1, merchant: 1, card: 1, scope: 1 },
    flags: [],
    dayGap: 0,
    ...overrides,
  };
}

describe('GatedDecisionPolicy', () => {
  it('auto-matches a top candidate that passes every gate, even with a runner-up exactly 0.10 behind', () => {
    const decision = policy.decide(doc, [candidate(), candidate({ confidence: 0.9 }, 2)]);
    expect(decision).toMatchObject({ outcome: 'AUTO_MATCHED', reasons: ['ALL_GATES_PASSED'] });
    expect(decision.candidates).toHaveLength(2);
  });

  it('is UNMATCHED · NO_CANDIDATES when nothing survived the filters, LOW_SCORE when all score below 0.50', () => {
    expect(policy.decide(doc, [])).toEqual({ outcome: 'UNMATCHED', reasons: ['NO_CANDIDATES'], candidates: [] });
    expect(policy.decide(doc, [candidate({ confidence: 0.49 })])).toEqual({
      outcome: 'UNMATCHED',
      reasons: ['LOW_SCORE'],
      candidates: [],
    });
  });

  it.each([
    ['score below 0.85', {}, { confidence: 0.84 }, ['BELOW_AUTO_THRESHOLD']],
    ['a near (non-tip) amount', {}, { signals: { amount: 0.5, date: 1, merchant: 1, card: 1 } }, ['AMOUNT_NOT_EXACT']],
    [
      'a tip (reported once)',
      {},
      { signals: { amount: 0.7, date: 1, merchant: 1, card: 1 }, flags: ['AMOUNT_TIP_TOLERANCE' as const] },
      ['AMOUNT_TIP_TOLERANCE'],
    ],
    ['no card and merchant < 0.80', {}, { signals: { amount: 1, date: 1, merchant: 0.79 } }, ['WEAK_IDENTITY']],
    ['OCR confidence < 0.80', { extractionConfidence: 0.79 }, {}, ['LOW_OCR_CONFIDENCE']],
    ['unknown OCR confidence (NaN)', { extractionConfidence: Number.NaN }, {}, ['LOW_OCR_CONFIDENCE']],
    [
      'a transaction that already has a document',
      {},
      { transaction: buildTransaction({ hasConfirmedDocument: true }) },
      ['TXN_ALREADY_HAS_DOCUMENT'],
    ],
    ['a possible card misread', {}, { flags: ['CARD_POSSIBLE_MISREAD' as const] }, ['CARD_POSSIBLE_MISREAD']],
  ])('sends to review for %s', (_label, docOverrides, topOverrides, reasons) => {
    const decision = policy.decide(buildPrepared(docOverrides), [candidate(topOverrides)]);
    expect(decision).toMatchObject({ outcome: 'NEEDS_REVIEW', reasons });
  });

  it('accepts identity from a strong merchant alone (no card on the receipt)', () => {
    expect(policy.decide(doc, [candidate({ signals: { amount: 1, date: 1, merchant: 0.8 } })]).outcome).toBe(
      'AUTO_MATCHED',
    );
  });

  it('reports NEAR_TIE against any runner-up, but keeps only candidates ≥ 0.50, at most five', () => {
    expect(policy.decide(doc, [candidate(), candidate({ confidence: 0.95 }, 2)]).reasons).toEqual(['NEAR_TIE']);
    const lowPair = policy.decide(doc, [candidate({ confidence: 0.55 }), candidate({ confidence: 0.49 }, 2)]);
    expect(lowPair.reasons).toEqual(['BELOW_AUTO_THRESHOLD', 'NEAR_TIE']);
    expect(lowPair.candidates.map((c) => c.transaction.id)).toEqual([1]);
    const many = Array.from({ length: 8 }, (_, index) => candidate({ confidence: 0.9 - index * 0.01 }, index + 1));
    expect(policy.decide(doc, many).candidates).toHaveLength(5);
  });

  it('lists every failed gate once, in canonical order', () => {
    const bad = candidate({
      confidence: 0.6,
      signals: { amount: 0.5, date: 0.4 },
      flags: ['CARD_POSSIBLE_MISREAD'],
      transaction: buildTransaction({ hasConfirmedDocument: true }),
    });
    const decision = policy.decide(buildPrepared({ extractionConfidence: 0.5 }), [
      bad,
      candidate({ confidence: 0.58 }, 2),
    ]);
    expect(decision.reasons).toEqual([
      'BELOW_AUTO_THRESHOLD',
      'AMOUNT_NOT_EXACT',
      'WEAK_IDENTITY',
      'NEAR_TIE',
      'LOW_OCR_CONFIDENCE',
      'TXN_ALREADY_HAS_DOCUMENT',
      'CARD_POSSIBLE_MISREAD',
    ]);
  });

  it('is open for extension with custom gates', () => {
    const strict = new GatedDecisionPolicy(defaultMatchingConfig, [{ reason: 'WEAK_IDENTITY', fails: () => true }]);
    expect(strict.decide(doc, [candidate()]).reasons).toEqual(['WEAK_IDENTITY']);
  });
});

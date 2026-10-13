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
  it('auto-matches a single candidate that passes every gate', () => {
    expect(policy.decide(doc, [candidate()])).toMatchObject({ outcome: 'AUTO_MATCHED', reasons: ['ALL_GATES_PASSED'] });
  });

  it('auto-matches when the runner-up is exactly the minimum margin behind', () => {
    const decision = policy.decide(doc, [candidate(), candidate({ confidence: 0.9 }, 2)]);
    expect(decision.outcome).toBe('AUTO_MATCHED');
    expect(decision.candidates).toHaveLength(2);
  });

  it('returns NO_CANDIDATES when nothing survived the filters', () => {
    expect(policy.decide(doc, [])).toEqual({ outcome: 'UNMATCHED', reasons: ['NO_CANDIDATES'], candidates: [] });
  });

  it('returns LOW_SCORE when every survivor is below the review threshold', () => {
    expect(policy.decide(doc, [candidate({ confidence: 0.49 })])).toEqual({
      outcome: 'UNMATCHED',
      reasons: ['LOW_SCORE'],
      candidates: [],
    });
  });

  it.each([
    ['score below 0.85', { confidence: 0.84 }, 'BELOW_AUTO_THRESHOLD'],
    ['near (non-tip) amount', { signals: { amount: 0.5, date: 1, merchant: 1, card: 1 } }, 'AMOUNT_NOT_EXACT'],
    ['no card and weak merchant', { signals: { amount: 1, date: 1, merchant: 0.79 } }, 'WEAK_IDENTITY'],
    ['no card and no merchant', { signals: { amount: 1, date: 1 } }, 'WEAK_IDENTITY'],
    [
      'transaction already has a document',
      { transaction: buildTransaction({ hasConfirmedDocument: true }) },
      'TXN_ALREADY_HAS_DOCUMENT',
    ],
    ['possible card misread flag', { flags: ['CARD_POSSIBLE_MISREAD' as const] }, 'CARD_POSSIBLE_MISREAD'],
  ])('sends to review when %s', (_label, overrides, reason) => {
    const decision = policy.decide(doc, [candidate(overrides)]);
    expect(decision.outcome).toBe('NEEDS_REVIEW');
    expect(decision.reasons).toContain(reason);
  });

  it('reports a tip once, as AMOUNT_TIP_TOLERANCE, not also as AMOUNT_NOT_EXACT', () => {
    const tip = candidate({ signals: { amount: 0.7, date: 1, merchant: 1, card: 1 }, flags: ['AMOUNT_TIP_TOLERANCE'] });
    expect(policy.decide(doc, [tip]).reasons).toEqual(['AMOUNT_TIP_TOLERANCE']);
  });

  it('accepts identity from a strong merchant alone', () => {
    expect(policy.decide(doc, [candidate({ signals: { amount: 1, date: 1, merchant: 0.8 } })]).outcome).toBe(
      'AUTO_MATCHED',
    );
  });

  it('reports NEAR_TIE when the runner-up is within the margin', () => {
    const decision = policy.decide(doc, [candidate(), candidate({ confidence: 0.95 }, 2)]);
    expect(decision.reasons).toEqual(['NEAR_TIE']);
  });

  it('considers a runner-up below the review threshold for the margin, but does not keep it', () => {
    const decision = policy.decide(doc, [candidate({ confidence: 0.55 }), candidate({ confidence: 0.49 }, 2)]);
    expect(decision.reasons).toEqual(expect.arrayContaining(['BELOW_AUTO_THRESHOLD', 'NEAR_TIE']));
    expect(decision.candidates.map((c) => c.transaction.id)).toEqual([1]);
  });

  it.each([0.79, Number.NaN])('reports LOW_OCR_CONFIDENCE for extraction confidence %p', (extractionConfidence) => {
    const lowOcr = buildPrepared({ extractionConfidence });
    expect(policy.decide(lowOcr, [candidate()]).reasons).toEqual(['LOW_OCR_CONFIDENCE']);
  });

  it('lists every failed gate in canonical order', () => {
    const bad = candidate({
      confidence: 0.6,
      signals: { amount: 0.5, date: 0.4 },
      flags: ['CARD_POSSIBLE_MISREAD'],
      transaction: buildTransaction({ hasConfirmedDocument: true }),
    });
    expect(
      policy.decide(buildPrepared({ extractionConfidence: 0.5 }), [bad, candidate({ confidence: 0.58 }, 2)]).reasons,
    ).toEqual([
      'BELOW_AUTO_THRESHOLD',
      'AMOUNT_NOT_EXACT',
      'WEAK_IDENTITY',
      'NEAR_TIE',
      'LOW_OCR_CONFIDENCE',
      'TXN_ALREADY_HAS_DOCUMENT',
      'CARD_POSSIBLE_MISREAD',
    ]);
  });

  it('keeps at most maxStoredCandidates plausible candidates', () => {
    const many = Array.from({ length: 8 }, (_, index) => candidate({ confidence: 0.9 - index * 0.01 }, index + 1));
    expect(policy.decide(doc, many).candidates).toHaveLength(5);
  });

  it('accepts custom gates (open for extension)', () => {
    const strict = new GatedDecisionPolicy(defaultMatchingConfig, [{ reason: 'WEAK_IDENTITY', fails: () => true }]);
    expect(strict.decide(doc, [candidate()]).reasons).toEqual(['WEAK_IDENTITY']);
  });
});

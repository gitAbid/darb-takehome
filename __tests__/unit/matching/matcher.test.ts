import type { DecisionPolicy } from '@/lib/services/matching/decision/decision-policy';
import type { CandidateFilter } from '@/lib/services/matching/filters/candidate-filter';
import { createMatcher, type MatcherDependencies } from '@/lib/services/matching/matcher';
import type { MerchantNormalizer } from '@/lib/services/matching/text/merchant-normalizer';
import type { FilterName } from '@/lib/services/matching/types';

import { buildFields, buildTransaction } from '../../helpers/matching-builders';

const normalizer: MerchantNormalizer = { normalize: (name) => [name.toLowerCase()] };
const autoPolicy: DecisionPolicy = {
  decide: (_doc, ranked) => ({ outcome: 'AUTO_MATCHED', reasons: ['ALL_GATES_PASSED'], candidates: [...ranked] }),
};

function rejecting(name: FilterName, ids: number[]): CandidateFilter {
  return { name, accepts: (_doc, transaction) => !ids.includes(transaction.id) };
}

function deps(overrides: Partial<MatcherDependencies> = {}): MatcherDependencies {
  return {
    normalizer,
    filters: [],
    scorers: [{ name: 'amount', score: () => ({ value: 1 }) }],
    weights: { amount: 1, date: 0, merchant: 0, card: 0, scope: 0 },
    policy: autoPolicy,
    ...overrides,
  };
}

describe('createMatcher', () => {
  it('returns NOT_MATCHABLE without consulting filters or the policy for an unusable document', () => {
    const policy = { decide: jest.fn() };
    const filter = { name: 'scope' as const, accepts: jest.fn() };
    const match = createMatcher(deps({ policy, filters: [filter] }));
    const result = match(buildFields({ documentType: 'UNKNOWN', totalAmount: null }), [buildTransaction()]);
    expect(result).toEqual({
      outcome: 'UNMATCHED',
      reasons: ['NOT_MATCHABLE'],
      candidates: [],
      excluded: { scope: 0, currency: 0, dateWindow: 0, amount: 0, card: 0 },
    });
    expect(filter.accepts).not.toHaveBeenCalled();
    expect(policy.decide).not.toHaveBeenCalled();
  });

  it('counts each removed transaction against the first filter that rejected it', () => {
    const match = createMatcher(deps({ filters: [rejecting('scope', [1, 2]), rejecting('currency', [2, 3])] }));
    const transactions = [1, 2, 3, 4].map((id) => buildTransaction({ id }));
    const result = match(buildFields(), transactions);
    expect(result.excluded).toEqual({ scope: 2, currency: 1, dateWindow: 0, amount: 0, card: 0 });
    expect(result.candidates.map((c) => c.transactionId)).toEqual([4]);
  });

  it('maps scored candidates to the public MatchCandidate shape', () => {
    const result = createMatcher(deps())(buildFields(), [buildTransaction({ id: 9 })]);
    expect(result.candidates).toEqual([{ transactionId: 9, confidence: 1, signals: { amount: 1 }, flags: [] }]);
  });

  it('passes candidates to the policy already ranked', () => {
    const decide = jest.fn(autoPolicy.decide);
    const scorers = [{ name: 'amount' as const, score: (_d: unknown, t: { id: number }) => ({ value: t.id / 10 }) }];
    createMatcher(deps({ policy: { decide }, scorers }))(
      buildFields(),
      [1, 3, 2].map((id) => buildTransaction({ id })),
    );
    const ranked = decide.mock.calls[0][1];
    expect(ranked.map((c) => c.transaction.id)).toEqual([3, 2, 1]);
  });
});

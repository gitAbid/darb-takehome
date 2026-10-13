/** Matcher-level rules through the real default wiring (IMPLEMENTATION.md §3, docs/SCENARIOS.md §5). */
import type { DecisionPolicy } from '@/lib/services/matching/decision/decision-policy';
import type { CandidateFilter } from '@/lib/services/matching/filters/candidate-filter';
import { createMatcher } from '@/lib/services/matching/matcher';
import type { FilterName } from '@/lib/services/matching/types';
import { matchDocument } from '@/lib/services/transaction-matcher';

import { buildFields, buildTransaction } from '../../helpers/matching-builders';

describe('matchDocument', () => {
  it.each([
    ['UNKNOWN document type', { documentType: 'UNKNOWN' as const }],
    ['missing amount', { totalAmount: null }],
    ['non-positive amount (refund)', { totalAmount: -500 }],
    ['amount not in halalas', { totalAmount: 57.5 }],
    ['missing date', { documentDate: null }],
    ['unparseable date', { documentDate: '31/02/2025' }],
  ])('is NOT_MATCHABLE for %s, without consulting candidates', (_label, overrides) => {
    expect(matchDocument(buildFields(overrides), [buildTransaction()])).toMatchObject({
      outcome: 'UNMATCHED',
      reasons: ['NOT_MATCHABLE'],
      candidates: [],
    });
  });

  it('only considers the sender’s client and, for WhatsApp, that driver’s transactions', () => {
    const transactions = [
      buildTransaction({ id: 1 }),
      buildTransaction({ id: 2, clientId: 2 }),
      buildTransaction({ id: 3, driverPhone: '+966552223344' }),
    ];
    const byClient = matchDocument(buildFields(), transactions);
    const byDriver = matchDocument(
      buildFields({ scope: { clientIds: [1], driverPhone: '+966551234567' } }),
      transactions,
    );
    expect(byClient.candidates.map((c) => c.transactionId).sort()).toEqual([1, 3]);
    expect(byDriver.candidates.map((c) => c.transactionId)).toEqual([1]);
    expect(byDriver.excluded.scope).toBe(2);
  });

  it('never compares different currencies; an unknown document currency is not filtered', () => {
    expect(matchDocument(buildFields({ currency: 'AED' }), [buildTransaction()]).excluded.currency).toBe(1);
    expect(matchDocument(buildFields({ currency: ' sar ' }), [buildTransaction()]).outcome).toBe('AUTO_MATCHED');
    expect(matchDocument(buildFields({ currency: null }), [buildTransaction()]).outcome).toBe('AUTO_MATCHED');
  });

  it('U05/U06 excludes a tip-sized difference at a fuel station and a charge lower than the receipt', () => {
    expect(
      matchDocument(buildFields({ totalAmount: 5000 }), [buildTransaction({ amount: 5500 })]).excluded.amount,
    ).toBe(1);
    const lower = buildTransaction({ amount: 4900, mcc: '5812' });
    expect(matchDocument(buildFields({ totalAmount: 5000 }), [lower]).excluded.amount).toBe(1);
  });

  it('U07 excludes a card whose last 4 differ in two or more digits', () => {
    expect(matchDocument(buildFields({ cardLast4: '4417' }), [buildTransaction()]).excluded.card).toBe(1);
  });

  it('U08/U09 applies the invoice window (20 days later → date 0.1) and the receipt window (2 days later → out)', () => {
    const invoice = buildFields({ documentType: 'TAX_INVOICE', documentDate: '2025-06-30', cardLast4: null });
    expect(matchDocument(invoice, [buildTransaction()]).candidates[0].signals.date).toBe(0.1);
    expect(matchDocument(buildFields({ documentDate: '2025-06-12' }), [buildTransaction()]).excluded.dateWindow).toBe(
      1,
    );
  });

  it('U11 treats a few halalas of VAT rounding as an exact amount and auto-matches', () => {
    const result = matchDocument(buildFields({ totalAmount: 10000 }), [buildTransaction({ amount: 10004 })]);
    expect(result).toMatchObject({ outcome: 'AUTO_MATCHED', candidates: [{ signals: { amount: 1 } }] });
  });

  it('U12 gives the identical result whatever order transactions arrive in', () => {
    const transactions = [1, 2, 3].map((id) => buildTransaction({ id }));
    expect(matchDocument(buildFields(), [...transactions].reverse())).toEqual(
      matchDocument(buildFields(), transactions),
    );
  });
});

describe('createMatcher pipeline', () => {
  const rejecting = (name: FilterName, ids: number[]): CandidateFilter => ({
    name,
    accepts: (_doc, transaction) => !ids.includes(transaction.id),
  });

  it('counts each removed transaction against the first filter that rejected it and hands the policy a ranked list', () => {
    const decide = jest.fn<ReturnType<DecisionPolicy['decide']>, Parameters<DecisionPolicy['decide']>>(
      (_doc, ranked) => ({ outcome: 'AUTO_MATCHED', reasons: ['ALL_GATES_PASSED'], candidates: [...ranked] }),
    );
    const match = createMatcher({
      normalizer: { normalize: (name) => [name] },
      filters: [rejecting('scope', [1, 2]), rejecting('currency', [2, 3])],
      scorers: [{ name: 'amount', score: (_doc, transaction) => ({ value: transaction.id / 10 }) }],
      weights: { amount: 1, date: 0, merchant: 0, card: 0, scope: 0 },
      policy: { decide },
    });
    const result = match(
      buildFields(),
      [1, 2, 3, 4, 5].map((id) => buildTransaction({ id })),
    );
    expect(result.excluded).toEqual({ scope: 2, currency: 1, dateWindow: 0, amount: 0, card: 0 });
    expect(decide.mock.calls[0][1].map((c) => c.transaction.id)).toEqual([5, 4]);
    expect(result.candidates[0]).toEqual({ transactionId: 5, confidence: 0.5, signals: { amount: 0.5 }, flags: [] });
  });
});

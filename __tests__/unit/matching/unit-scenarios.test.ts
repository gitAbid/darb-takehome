/** Matcher unit-only scenarios from docs/SCENARIOS.md §5, built with test builders. */
import { matchDocument } from '@/lib/services/transaction-matcher';

import { buildFields, buildTransaction } from '../../helpers/matching-builders';

describe('matcher unit scenarios (docs/SCENARIOS.md §5)', () => {
  it('U01 perfect match with low OCR confidence → review', () => {
    const result = matchDocument(buildFields({ extractionConfidence: 0.65 }), [buildTransaction()]);
    expect(result).toMatchObject({ outcome: 'NEEDS_REVIEW', reasons: ['LOW_OCR_CONFIDENCE'] });
  });

  it('U02 amount + date only (no merchant, no card) → WEAK_IDENTITY despite a 1.00 score', () => {
    const result = matchDocument(buildFields({ merchantName: null, cardLast4: null }), [buildTransaction()]);
    expect(result).toMatchObject({ outcome: 'NEEDS_REVIEW', reasons: ['WEAK_IDENTITY'] });
    expect(result.candidates[0].confidence).toBe(1);
  });

  it('U03 3-day gap, merchant 0.80-ish, no card → BELOW_AUTO_THRESHOLD', () => {
    const transaction = buildTransaction({ transactionAt: new Date('2025-06-13T08:00:00Z') });
    const result = matchDocument(buildFields({ cardLast4: null }), [transaction]);
    expect(result.candidates[0].confidence).toBe(0.85);
    const weaker = matchDocument(
      buildFields({ cardLast4: null, merchantName: 'Alfanar Fuel Services Riyadh Branch' }),
      [transaction],
    );
    expect(weaker.outcome).toBe('NEEDS_REVIEW');
  });

  it('U04 only candidate below 0.50 → UNMATCHED LOW_SCORE', () => {
    const transaction = buildTransaction({ amount: 15100, merchantName: 'ZAMIL MARKET', cardLast4: '4477' });
    const result = matchDocument(buildFields({ documentDate: '2025-06-07' }), [
      { ...transaction, transactionAt: new Date('2025-06-10T08:00:00Z') },
    ]);
    expect(result).toMatchObject({ outcome: 'UNMATCHED', reasons: ['LOW_SCORE'], candidates: [] });
  });

  it('U05 tip-sized difference at a fuel station → excluded by the amount filter', () => {
    const result = matchDocument(buildFields({ totalAmount: 5000 }), [buildTransaction({ amount: 5500 })]);
    expect(result).toMatchObject({ outcome: 'UNMATCHED', reasons: ['NO_CANDIDATES'] });
    expect(result.excluded.amount).toBe(1);
  });

  it('U06 card charged less than the receipt → excluded', () => {
    const result = matchDocument(buildFields({ totalAmount: 5000 }), [buildTransaction({ amount: 4900, mcc: '5812' })]);
    expect(result.excluded.amount).toBe(1);
  });

  it('U07 two card digits differ → excluded by the card filter', () => {
    const result = matchDocument(buildFields({ cardLast4: '4417' }), [buildTransaction()]);
    expect(result.excluded.card).toBe(1);
  });

  it('U08 tax invoice 20 days after the purchase → inside the window, date signal 0.1', () => {
    const invoice = buildFields({ documentType: 'TAX_INVOICE', documentDate: '2025-06-30', cardLast4: null });
    const [candidate] = matchDocument(invoice, [buildTransaction()]).candidates;
    expect(candidate.signals.date).toBe(0.1);
  });

  it('U09 receipt dated 2 days after the transaction → excluded by the date window', () => {
    const result = matchDocument(buildFields({ documentDate: '2025-06-12' }), [buildTransaction()]);
    expect(result.excluded.dateWindow).toBe(1);
  });

  it('U10 empty transaction list → UNMATCHED NO_CANDIDATES, never throws', () => {
    expect(matchDocument(buildFields(), [])).toMatchObject({ outcome: 'UNMATCHED', reasons: ['NO_CANDIDATES'] });
  });

  it('U11 a few halalas of VAT rounding is still an exact amount', () => {
    const result = matchDocument(buildFields({ totalAmount: 10000 }), [buildTransaction({ amount: 10004 })]);
    expect(result.candidates[0].signals.amount).toBe(1);
    expect(result.outcome).toBe('AUTO_MATCHED');
  });

  it('U12 the same inputs in a different order give an identical result', () => {
    const transactions = [1, 2, 3].map((id) => buildTransaction({ id }));
    const forward = matchDocument(buildFields(), transactions);
    const reversed = matchDocument(buildFields(), [...transactions].reverse());
    expect(reversed).toEqual(forward);
  });
});

import { AmountFilter } from '@/lib/services/matching/filters/amount-filter';
import { CardFilter } from '@/lib/services/matching/filters/card-filter';
import { CurrencyFilter } from '@/lib/services/matching/filters/currency-filter';
import { DateWindowFilter } from '@/lib/services/matching/filters/date-window-filter';
import { ScopeFilter } from '@/lib/services/matching/filters/scope-filter';
import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';

import { buildPrepared, buildTransaction } from '../../helpers/matching-builders';

const D1 = '+966551234567';

describe('ScopeFilter', () => {
  const filter = new ScopeFilter();

  it('accepts a transaction of an in-scope client when no driver is set (email)', () => {
    expect(filter.accepts(buildPrepared(), buildTransaction({ driverPhone: '+966500000000' }))).toBe(true);
  });

  it('rejects another client, even with identical everything else', () => {
    expect(filter.accepts(buildPrepared(), buildTransaction({ clientId: 2 }))).toBe(false);
  });

  it('for WhatsApp, accepts only that driver’s transactions', () => {
    const doc = buildPrepared({ scope: { clientIds: [1], driverPhone: D1 } });
    expect(filter.accepts(doc, buildTransaction({ driverPhone: D1 }))).toBe(true);
    expect(filter.accepts(doc, buildTransaction({ driverPhone: '+966552223344' }))).toBe(false);
    expect(filter.accepts(doc, buildTransaction({ driverPhone: null }))).toBe(false);
  });

  it('rejects everything for an empty scope', () => {
    expect(filter.accepts(buildPrepared({ scope: { clientIds: [], driverPhone: null } }), buildTransaction())).toBe(
      false,
    );
  });
});

describe('CurrencyFilter', () => {
  const filter = new CurrencyFilter();

  it('accepts the same currency, ignoring case and whitespace', () => {
    expect(filter.accepts(buildPrepared({ currency: ' sar ' }), buildTransaction())).toBe(true);
  });

  it('rejects a different currency', () => {
    expect(filter.accepts(buildPrepared({ currency: 'AED' }), buildTransaction())).toBe(false);
  });

  it.each([null, '', '   '])('does not filter when the document currency is unknown (%p)', (currency) => {
    expect(filter.accepts(buildPrepared({ currency }), buildTransaction())).toBe(true);
  });
});

describe('DateWindowFilter', () => {
  const filter = new DateWindowFilter(defaultMatchingConfig.date);
  const at = (iso: string) => buildTransaction({ transactionAt: new Date(iso) });

  it.each([
    ['transaction 3 days after the receipt', '2025-06-13T08:00:00Z', true],
    ['transaction 4 days after the receipt', '2025-06-14T08:00:00Z', false],
    ['transaction 1 day before the receipt', '2025-06-09T08:00:00Z', true],
    ['transaction 2 days before the receipt', '2025-06-08T08:00:00Z', false],
  ])('receipt window −3…+1: %s → %p', (_label, transactionAt, expected) => {
    expect(filter.accepts(buildPrepared({ documentDate: '2025-06-10' }), at(transactionAt))).toBe(expected);
  });

  it.each([
    ['invoice 30 days after the purchase', '2025-05-11T08:00:00Z', true],
    ['invoice 31 days after the purchase', '2025-05-10T08:00:00Z', false],
    ['invoice 1 day before the purchase', '2025-06-11T08:00:00Z', true],
    ['invoice 2 days before the purchase', '2025-06-12T08:00:00Z', false],
  ])('tax invoice window −1…+30: %s → %p', (_label, transactionAt, expected) => {
    const doc = buildPrepared({ documentType: 'TAX_INVOICE', documentDate: '2025-06-10' });
    expect(filter.accepts(doc, at(transactionAt))).toBe(expected);
  });

  it('rejects a transaction with an invalid date', () => {
    expect(filter.accepts(buildPrepared(), buildTransaction({ transactionAt: new Date('bad') }))).toBe(false);
  });
});

describe('AmountFilter', () => {
  const filter = new AmountFilter(defaultMatchingConfig.amount);

  it('accepts exact, tip and near amounts', () => {
    expect(filter.accepts(buildPrepared({ totalAmount: 15000 }), buildTransaction({ amount: 15003 }))).toBe(true);
    expect(filter.accepts(buildPrepared({ totalAmount: 5750 }), buildTransaction({ amount: 6325, mcc: '5812' }))).toBe(
      true,
    );
    expect(filter.accepts(buildPrepared({ totalAmount: 15000 }), buildTransaction({ amount: 15100 }))).toBe(true);
  });

  it('rejects a different purchase amount', () => {
    expect(filter.accepts(buildPrepared({ totalAmount: 15000 }), buildTransaction({ amount: 20000 }))).toBe(false);
  });
});

describe('CardFilter', () => {
  const filter = new CardFilter();

  it.each([
    ['4471', true],
    ['4477', true],
    ['4417', false],
    ['9902', false],
  ])('receipt 4471 vs card %s → %p', (last4, expected) => {
    expect(filter.accepts(buildPrepared({ cardLast4: '4471' }), buildTransaction({ cardLast4: last4 }))).toBe(expected);
  });

  it('accepts when the receipt shows no card digits', () => {
    expect(filter.accepts(buildPrepared({ cardLast4: null }), buildTransaction())).toBe(true);
  });
});

/** Properties that must hold for any input, checked over many seeded random documents and transactions. */
import type { CandidateTransaction, ExtractedFields } from '@/lib/services/matching/types';
import { matchDocument } from '@/lib/services/transaction-matcher';

import { buildFields, buildTransaction } from '../../helpers/matching-builders';
import { pick, seededRandom, shuffle } from '../../helpers/seeded-random';

const RUNS = 300;
const MERCHANTS = ['ALFANAR FUEL ST 04 RUH', 'RAWABI FUEL 07 DMM', 'AL MASHWAR GRILL JED', 'LAMAA CAR WASH RUH', '#$%'];
const RECEIPT_NAMES = ['Alfanar Fuel Station', 'Rawabi Fuel', 'Al Mashwar Grill', 'Lamaa Car Wash', null, ''];
const LAST4 = ['4471', '4477', '4417', '8820', null];
const MCCS = ['5541', '5812', '5814', '7542'];

function randomFields(random: () => number): ExtractedFields {
  return buildFields({
    documentType: pick(random, ['RECEIPT', 'TAX_INVOICE', 'RECEIPT'] as const),
    merchantName: pick(random, RECEIPT_NAMES),
    totalAmount: pick(random, [5750, 10000, 15000, 20000, null, 0, -100, 12.5]),
    currency: pick(random, ['SAR', 'sar', null, 'AED']),
    documentDate: pick(random, ['2025-06-10', '2025-06-12', '2025-06-14', 'garbage', null]),
    cardLast4: pick(random, LAST4),
    extractionConfidence: pick(random, [0.95, 0.85, 0.7, Number.NaN]),
    scope: pick(random, [
      { clientIds: [1], driverPhone: null },
      { clientIds: [1, 2], driverPhone: null },
      { clientIds: [1], driverPhone: '+966551234567' },
      { clientIds: [], driverPhone: null },
    ]),
  });
}

function randomTransactions(random: () => number): CandidateTransaction[] {
  return Array.from({ length: 1 + Math.floor(random() * 8) }, (_, index) =>
    buildTransaction({
      id: index + 1,
      clientId: pick(random, [1, 1, 2]),
      driverPhone: pick(random, ['+966551234567', '+966552223344', null]),
      cardLast4: pick(random, ['4471', '4477', '8820']),
      merchantName: pick(random, MERCHANTS),
      mcc: pick(random, MCCS),
      amount: pick(random, [5750, 6325, 10000, 10004, 15000, 15100, 20000]),
      transactionAt: new Date(Date.UTC(2025, 5, 8 + Math.floor(random() * 8), Math.floor(random() * 24))),
      hasConfirmedDocument: random() < 0.15,
    }),
  );
}

function forEachRandomCase(
  check: (fields: ExtractedFields, transactions: CandidateTransaction[], random: () => number) => void,
) {
  const random = seededRandom(20250614);
  for (let run = 0; run < RUNS; run += 1) check(randomFields(random), randomTransactions(random), random);
}

describe('matcher invariants', () => {
  it('never throws and always returns a well-formed result (and the random cases reach every outcome)', () => {
    const outcomes = new Set<string>();
    forEachRandomCase((fields, transactions) => {
      const result = matchDocument(fields, transactions);
      outcomes.add(result.outcome);
      expect(['AUTO_MATCHED', 'NEEDS_REVIEW', 'UNMATCHED']).toContain(result.outcome);
      expect(result.reasons.length).toBeGreaterThan(0);
      const excludedTotal = Object.values(result.excluded).reduce((sum, count) => sum + count, 0);
      expect(excludedTotal).toBeLessThanOrEqual(transactions.length);
    });
    expect([...outcomes].sort()).toEqual(['AUTO_MATCHED', 'NEEDS_REVIEW', 'UNMATCHED']);
  });

  it('keeps every confidence and signal within [0, 1], ranked best first', () => {
    forEachRandomCase((fields, transactions) => {
      const { candidates } = matchDocument(fields, transactions);
      for (const candidate of candidates) {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
        for (const value of Object.values(candidate.signals)) expect(value >= 0 && value <= 1).toBe(true);
      }
      const confidences = candidates.map((candidate) => candidate.confidence);
      expect(confidences).toEqual([...confidences].sort((a, b) => b - a));
    });
  });

  it('never returns a transaction outside the sender scope', () => {
    forEachRandomCase((fields, transactions) => {
      const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]));
      for (const candidate of matchDocument(fields, transactions).candidates) {
        const transaction = byId.get(candidate.transactionId)!;
        expect(fields.scope.clientIds).toContain(transaction.clientId);
        if (fields.scope.driverPhone !== null) expect(transaction.driverPhone).toBe(fields.scope.driverPhone);
      }
    });
  });

  it('gives the same result whatever order the transactions arrive in', () => {
    forEachRandomCase((fields, transactions, random) => {
      expect(matchDocument(fields, shuffle(random, transactions))).toEqual(matchDocument(fields, transactions));
    });
  });
});

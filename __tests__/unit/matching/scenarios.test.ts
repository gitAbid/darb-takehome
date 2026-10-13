/**
 * End-to-end matcher scenarios from docs/SCENARIOS.md §3, run against the seeded transactions and the committed
 * extraction fixtures with the real default matcher. Each row asserts outcome, reasons, ranking and scores.
 */
import type { ReasonCode } from '@/lib/domain/reason-codes';
import type { MatchOutcome, SenderScope } from '@/lib/services/matching/types';
import { matchDocument } from '@/lib/services/transaction-matcher';
import { DRIVERS } from '@/prisma/seed-data/drivers';

import { scenarioFields, seededCandidates, txnId } from '../../helpers/scenario-data';

const whatsapp = (driver: keyof typeof DRIVERS): SenderScope => ({
  clientIds: [DRIVERS[driver].clientId],
  driverPhone: DRIVERS[driver].phone,
});
const email = (clientId: number): SenderScope => ({ clientIds: [clientId], driverPhone: null });

interface Row {
  id: string;
  folder: string;
  scope: SenderScope;
  outcome: MatchOutcome;
  reasons: ReasonCode[];
  ranked: [string, number][];
}

const ROWS: Row[] = [
  {
    id: 'S01 exact match',
    folder: '01-exact-match',
    scope: whatsapp('D1'),
    outcome: 'AUTO_MATCHED',
    reasons: ['ALL_GATES_PASSED'],
    ranked: [
      ['T01', 1],
      ['T03', 0.88],
    ],
  },
  {
    id: 'S02 same chain, same amount, same day',
    folder: '02-ambiguous-same-chain',
    scope: email(1),
    outcome: 'NEEDS_REVIEW',
    reasons: ['NEAR_TIE'],
    ranked: [
      ['T04', 1],
      ['T05', 1],
    ],
  },
  {
    id: 'S03 restaurant tip',
    folder: '03-restaurant-tip',
    scope: whatsapp('D2'),
    outcome: 'NEEDS_REVIEW',
    reasons: ['AMOUNT_TIP_TOLERANCE'],
    ranked: [['T06', 0.88]],
  },
  {
    id: 'S05 invoice before its transaction',
    folder: '05-invoice-no-transaction',
    scope: email(1),
    outcome: 'UNMATCHED',
    reasons: ['NO_CANDIDATES'],
    ranked: [],
  },
  {
    id: 'S06 garbage extraction',
    folder: '06-garbage-extraction',
    scope: whatsapp('D1'),
    outcome: 'UNMATCHED',
    reasons: ['NOT_MATCHABLE'],
    ranked: [],
  },
  {
    id: 'S07 transaction already has a confirmed document',
    folder: '07-invoice-after-confirmed-receipt',
    scope: email(1),
    outcome: 'NEEDS_REVIEW',
    reasons: ['TXN_ALREADY_HAS_DOCUMENT'],
    ranked: [['T07', 1]],
  },
  {
    id: 'S08 shared last4 within one client',
    folder: '08-shared-last4',
    scope: email(1),
    outcome: 'NEEDS_REVIEW',
    reasons: ['NEAR_TIE'],
    ranked: [
      ['T08', 1],
      ['T09', 1],
    ],
  },
  {
    id: 'S09 card digit misread',
    folder: '09-card-misread',
    scope: whatsapp('D1'),
    outcome: 'NEEDS_REVIEW',
    reasons: ['CARD_POSSIBLE_MISREAD'],
    ranked: [['T10', 0.86]],
  },
  {
    id: 'S12 back-to-back round-amount refuels',
    folder: '12-back-to-back-refuel',
    scope: whatsapp('D1'),
    outcome: 'NEEDS_REVIEW',
    reasons: ['NEAR_TIE'],
    ranked: [
      ['T11', 1],
      ['T12', 0.95],
    ],
  },
  {
    id: 'S13 foreign-currency receipt',
    folder: '13-foreign-currency',
    scope: whatsapp('D3'),
    outcome: 'UNMATCHED',
    reasons: ['NO_CANDIDATES'],
    ranked: [],
  },
];

describe('matcher scenarios (docs/SCENARIOS.md §3)', () => {
  const transactions = seededCandidates();

  it.each(ROWS)('$id → $outcome $reasons', ({ folder, scope, outcome, reasons, ranked }) => {
    const result = matchDocument(scenarioFields(folder, scope), transactions);
    expect(result.outcome).toBe(outcome);
    expect(result.reasons).toEqual(reasons);
    expect(result.candidates.map((c) => [c.transactionId, c.confidence])).toEqual(
      ranked.map(([ref, score]) => [txnId(ref), score]),
    );
  });

  it('S01 never shows the other client’s identical transaction (T02) — scoping', () => {
    const result = matchDocument(scenarioFields('01-exact-match', email(1)), transactions);
    expect(result.candidates.map((c) => c.transactionId)).not.toContain(txnId('T02'));
  });

  it('S01 explains its decision with the full signal breakdown', () => {
    const [top] = matchDocument(scenarioFields('01-exact-match', whatsapp('D1')), transactions).candidates;
    expect(top.signals).toEqual({ amount: 1, date: 1, merchant: 1, card: 1, scope: 1 });
  });

  it('S03 keeps the exact-amount transaction of the other client (T14) out — scoping beats amount', () => {
    const result = matchDocument(scenarioFields('03-restaurant-tip', whatsapp('D2')), transactions);
    expect(result.candidates.map((c) => c.transactionId)).toEqual([txnId('T06')]);
    expect(result.candidates[0].flags).toEqual(['AMOUNT_TIP_TOLERANCE']);
  });

  it('S02 compares Riyadh days: T04 at 22:30 UTC on the 13th is the 14th in Riyadh', () => {
    const result = matchDocument(scenarioFields('02-ambiguous-same-chain', email(1)), transactions);
    expect(result.candidates[0].signals.date).toBe(1);
  });

  it('S05 and S13 explain why nothing matched', () => {
    expect(matchDocument(scenarioFields('05-invoice-no-transaction', email(1)), transactions).excluded).toEqual({
      scope: 4,
      currency: 0,
      dateWindow: 2,
      amount: 9,
      card: 0,
    });
    expect(matchDocument(scenarioFields('13-foreign-currency', whatsapp('D3')), transactions).excluded).toEqual({
      scope: 11,
      currency: 4,
      dateWindow: 0,
      amount: 0,
      card: 0,
    });
  });

  it('S11 has no scope (unknown sender) → nothing can match', () => {
    const result = matchDocument(
      scenarioFields('11-unknown-sender', { clientIds: [], driverPhone: null }),
      transactions,
    );
    expect(result).toMatchObject({ outcome: 'UNMATCHED', reasons: ['NO_CANDIDATES'] });
    expect(result.excluded.scope).toBe(transactions.length);
  });
});

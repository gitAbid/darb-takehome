/**
 * Bonus B2 end-to-end: a document that arrived before its transaction is matched once the card feed delivers the
 * transaction (POST /api/transactions → re-match after the response).
 */
import { PrismaClient } from '@prisma/client';

import { createTestApp, documentOutcome, readFixtureJson, resetAndSeed } from '../helpers/e2e-app';
import { db } from '../helpers/test-database';

const transaction = (overrides: Record<string, unknown> = {}) => ({
  externalRef: 'feed-T16',
  clientId: 1,
  cardId: 3,
  driverPhone: '+966554445566',
  merchantName: 'SAHARA AUTO SVC RUH',
  mcc: '7538',
  amount: 34000,
  currency: 'SAR',
  transactionAt: '2025-06-15T08:00:00Z',
  ...overrides,
});
const scenario = (folder: string) => readFixtureJson('scenarios', folder, 'payload.json');

beforeEach(resetAndSeed);
afterAll(() => db.$disconnect());

describe('re-matching when a transaction arrives', () => {
  it('S05: the invoice that arrived first is auto-matched to its late transaction; other documents are untouched', async () => {
    const app = createTestApp();
    await app.post('email', scenario('05-invoice-no-transaction'));
    await app.post('whatsapp', scenario('13-foreign-currency'));
    await app.post('email', scenario('11-unknown-sender'));
    expect((await documentOutcome('msg_S05:0')).status).toBe('UNMATCHED');

    const response = await app.postTransaction(transaction());
    expect(response).toEqual({ status: 201, body: { kind: 'created', transactionId: expect.any(Number) } });
    const t16 = response.body.transactionId as number;

    const s05 = await db.document.findUniqueOrThrow({ where: { externalId: 'msg_S05:0' }, include: { matches: true } });
    expect(s05).toMatchObject({ status: 'MATCHED', decisionReasons: ['ALL_GATES_PASSED'] });
    expect(s05.matches).toEqual([
      expect.objectContaining({ transactionId: t16, status: 'AUTO_CONFIRMED', decidedBy: 'system' }),
    ]);
    expect((await documentOutcome('wamid.S13-0001')).status).toBe('UNMATCHED');
    expect((await documentOutcome('msg_8f2a1:0')).status).toBe('UNMATCHED');
    expect(app.logger.find('rematch.completed').map((entry) => entry.context)).toEqual([
      expect.objectContaining({ transactionId: t16, rematched: 1 }),
    ]);
  });

  it('never re-proposes a transaction a reviewer already rejected for the document', async () => {
    const app = createTestApp();
    await app.post('email', scenario('02-ambiguous-same-chain'));
    await db.documentMatch.updateMany({
      where: { document: { externalId: 'msg_S02:0' } },
      data: { status: 'REJECTED', decidedBy: 'reviewer:demo', decidedAt: new Date() },
    });
    await db.document.update({ where: { externalId: 'msg_S02:0' }, data: { status: 'UNMATCHED' } });

    await app.postTransaction(
      transaction({
        externalRef: 'feed-T17',
        cardId: 1,
        merchantName: 'ALFANAR FUEL ST 07 RUH',
        mcc: '5541',
        amount: 20000,
        transactionAt: '2025-06-14T09:00:00Z',
      }),
    );
    const outcome = await documentOutcome('msg_S02:0');
    expect(outcome.status).toBe('MATCHED');
    expect(outcome.matches).toHaveLength(3);
    expect(outcome.matches).toEqual(
      expect.arrayContaining([
        ['T04', 'REJECTED', 1],
        ['T05', 'REJECTED', 1],
        [undefined, 'AUTO_CONFIRMED', 1],
      ]),
    );
  });
});

describe('POST /api/transactions', () => {
  it('is idempotent on externalRef, validates payload and card ownership, and answers 500 only when nothing is stored', async () => {
    const app = createTestApp();
    const first = await app.postTransaction(transaction());
    expect(await app.postTransaction(transaction())).toEqual({
      status: 200,
      body: { kind: 'duplicate', transactionId: first.body.transactionId },
    });
    const invalid = await app.postTransaction(transaction({ externalRef: 'x', amount: -1, mcc: 'fuel' }));
    expect(invalid.status).toBe(400);
    expect((invalid.body.issues as { path: string }[]).map((issue) => issue.path)).toEqual(['mcc', 'amount']);
    expect(await app.postTransaction(transaction({ externalRef: 'y', cardId: 4 }))).toMatchObject({
      status: 400,
      body: { issues: [{ path: 'cardId', message: 'card does not belong to this client' }] },
    });
    expect((await app.postTransaction('{oops')).status).toBe(400);
    expect(app.logger.find('webhook.rejected').map((entry) => entry.context.issues)).toEqual([
      ['mcc', 'amount'],
      ['cardId'],
    ]);
    expect(await db.transaction.count({ where: { externalRef: { not: null } } })).toBe(1);
    const unreachable = new PrismaClient({ datasources: { db: { url: 'file:/nonexistent-dir/none.db' } } });
    expect(await createTestApp({ db: unreachable }).postTransaction(transaction({ externalRef: 'z' }))).toEqual({
      status: 500,
      body: { error: 'INTERNAL' },
    });
    await unreachable.$disconnect();
  });
});

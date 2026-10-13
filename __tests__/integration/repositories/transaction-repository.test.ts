import { PrismaTransactionRepository } from '@/lib/repositories/prisma/prisma-transaction-repository';
import type { CandidateQuery } from '@/lib/repositories/records';

import {
  createCard,
  createClient,
  createDocument,
  createTransaction,
  createTransactionGraph,
  db,
  resetDatabase,
} from '../../helpers/test-database';

const repository = new PrismaTransactionRepository(db);
const D1 = '+966551234567';
const D2 = '+966552223344';

function query(overrides: Partial<CandidateQuery> = {}): CandidateQuery {
  return {
    clientIds: [],
    driverPhone: null,
    from: new Date('2025-06-01T00:00:00Z'),
    to: new Date('2025-06-30T23:59:59Z'),
    ...overrides,
  };
}

async function confirmMatch(documentId: number, transactionId: number) {
  return db.documentMatch.create({
    data: {
      documentId,
      transactionId,
      rank: 1,
      confidence: 1,
      signals: {},
      flags: [],
      status: 'CONFIRMED',
      decidedBy: 'reviewer:test',
      decidedAt: new Date(),
      confirmedTransactionId: transactionId,
      confirmedDocumentId: documentId,
    },
  });
}

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('PrismaTransactionRepository.findCandidates', () => {
  it('returns [] for an empty scope without querying', async () => {
    const spy = jest.spyOn(db.transaction, 'findMany');
    expect(await repository.findCandidates(query())).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('maps a transaction to the matcher shape, joining the card last4', async () => {
    const { client, transaction } = await createTransactionGraph();
    expect(await repository.findCandidates(query({ clientIds: [client.id] }))).toEqual([
      {
        id: transaction.id,
        clientId: client.id,
        driverPhone: D1,
        cardLast4: '4471',
        merchantName: 'ALFANAR FUEL ST 04 RUH',
        mcc: '5541',
        amount: 15000,
        currency: 'SAR',
        transactionAt: new Date('2025-06-10T07:42:00Z'),
        hasConfirmedDocument: false,
      },
    ]);
  });

  it('excludes an identical transaction of another client', async () => {
    const mine = await createTransactionGraph();
    await createTransactionGraph();
    const found = await repository.findCandidates(query({ clientIds: [mine.client.id] }));
    expect(found.map((candidate) => candidate.id)).toEqual([mine.transaction.id]);
  });

  it('returns transactions of every client in scope', async () => {
    const first = await createTransactionGraph();
    const second = await createTransactionGraph();
    const found = await repository.findCandidates(query({ clientIds: [first.client.id, second.client.id] }));
    expect(found).toHaveLength(2);
  });

  it('filters by driver phone when the scope has one (WhatsApp)', async () => {
    const { client, card, transaction } = await createTransactionGraph();
    await createTransaction(client.id, card.id, { driverPhone: D2 });
    await createTransaction(client.id, card.id, { driverPhone: null });
    const found = await repository.findCandidates(query({ clientIds: [client.id], driverPhone: D1 }));
    expect(found.map((candidate) => candidate.id)).toEqual([transaction.id]);
  });

  it('includes transactions exactly on both date bounds and excludes those outside', async () => {
    const client = await createClient();
    const card = await createCard(client.id);
    const at = (iso: string) => createTransaction(client.id, card.id, { transactionAt: new Date(iso) });
    const onFrom = await at('2025-06-01T00:00:00Z');
    const onTo = await at('2025-06-30T23:59:59Z');
    await at('2025-05-31T23:59:59Z');
    await at('2025-07-01T00:00:00Z');
    const found = await repository.findCandidates(query({ clientIds: [client.id] }));
    expect(found.map((candidate) => candidate.id)).toEqual([onFrom.id, onTo.id]);
  });

  it('orders by transaction time, then id', async () => {
    const client = await createClient();
    const card = await createCard(client.id);
    const at = (iso: string) => createTransaction(client.id, card.id, { transactionAt: new Date(iso) });
    const late = await at('2025-06-12T08:00:00Z');
    const early = await at('2025-06-10T08:00:00Z');
    const sameTimeA = await at('2025-06-11T08:00:00Z');
    const sameTimeB = await at('2025-06-11T08:00:00Z');
    const found = await repository.findCandidates(query({ clientIds: [client.id] }));
    expect(found.map((candidate) => candidate.id)).toEqual([early.id, sameTimeA.id, sameTimeB.id, late.id]);
  });

  it('keeps two cards with the same last4 apart, each with its own transaction', async () => {
    const client = await createClient();
    const cardA = await createCard(client.id, { last4: '4471', label: 'A' });
    const cardB = await createCard(client.id, { last4: '4471', label: 'B' });
    await createTransaction(client.id, cardA.id);
    await createTransaction(client.id, cardB.id);
    const found = await repository.findCandidates(query({ clientIds: [client.id] }));
    expect(found.map((candidate) => candidate.cardLast4)).toEqual(['4471', '4471']);
    expect(new Set(found.map((candidate) => candidate.id)).size).toBe(2);
  });

  it('reports hasConfirmedDocument only for a confirmed match', async () => {
    const client = await createClient();
    const card = await createCard(client.id);
    const confirmed = await createTransaction(client.id, card.id);
    const candidateOnly = await createTransaction(client.id, card.id);
    const rejectedOnly = await createTransaction(client.id, card.id);
    await confirmMatch((await createDocument()).id, confirmed.id);
    const base = { rank: 1, confidence: 0.9, signals: {}, flags: [] };
    await db.documentMatch.create({
      data: { ...base, documentId: (await createDocument()).id, transactionId: candidateOnly.id },
    });
    await db.documentMatch.create({
      data: {
        ...base,
        documentId: (await createDocument()).id,
        transactionId: rejectedOnly.id,
        status: 'REJECTED',
        decidedBy: 'system',
        decidedAt: new Date(),
      },
    });
    const found = await repository.findCandidates(query({ clientIds: [client.id] }));
    const flags = Object.fromEntries(found.map((candidate) => [candidate.id, candidate.hasConfirmedDocument]));
    expect(flags).toEqual({ [confirmed.id]: true, [candidateOnly.id]: false, [rejectedOnly.id]: false });
  });
});

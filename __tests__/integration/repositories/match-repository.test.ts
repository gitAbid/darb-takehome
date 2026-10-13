import type { NewMatch } from '@/lib/repositories/records';
import { PrismaMatchRepository } from '@/lib/repositories/prisma/prisma-match-repository';

import {
  createDocument,
  createTransaction,
  createTransactionGraph,
  db,
  resetDatabase,
} from '../../helpers/test-database';

const repository = new PrismaMatchRepository(db);
const DECIDED_AT = new Date('2025-06-15T10:00:00Z');

function newMatch(transactionId: number, overrides: Partial<NewMatch> = {}): NewMatch {
  return {
    transactionId,
    rank: 1,
    confidence: 0.9,
    signals: { amount: 1, date: 0.8, scope: 1 },
    flags: [],
    status: 'CANDIDATE',
    decidedBy: null,
    decidedAt: null,
    ...overrides,
  };
}

/** A document with two candidate transactions (ranks 1 and 2). */
async function candidatesFixture() {
  const { client, card, transaction: first } = await createTransactionGraph();
  const second = await createTransaction(client.id, card.id, { amount: 15000 });
  const document = await createDocument();
  await repository.createMany(document.id, [
    newMatch(first.id, { rank: 1 }),
    newMatch(second.id, { rank: 2, confidence: 0.85, flags: ['CARD_POSSIBLE_MISREAD'] }),
  ]);
  const [top, runnerUp] = await repository.listForDocument(document.id);
  return { document, first, second, top, runnerUp };
}

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('PrismaMatchRepository.createMany', () => {
  it('stores ranked candidates with signals and flags, listed by rank', async () => {
    const { document, first, second, top, runnerUp } = await candidatesFixture();
    expect(top).toEqual({
      id: expect.any(Number),
      documentId: document.id,
      ...newMatch(first.id, { rank: 1 }),
    });
    expect(runnerUp).toMatchObject({ transactionId: second.id, rank: 2, flags: ['CARD_POSSIBLE_MISREAD'] });
  });

  it('claims the confirmed slots only for confirmed statuses', async () => {
    const { client, card, transaction } = await createTransactionGraph();
    const other = await createTransaction(client.id, card.id);
    const document = await createDocument();
    await repository.createMany(document.id, [
      newMatch(transaction.id, { status: 'AUTO_CONFIRMED', decidedBy: 'system', decidedAt: DECIDED_AT }),
      newMatch(other.id, { rank: 2, status: 'REJECTED', decidedBy: 'system', decidedAt: DECIDED_AT }),
    ]);
    const rows = await db.documentMatch.findMany({ orderBy: { rank: 'asc' } });
    expect(rows.map((row) => [row.confirmedTransactionId, row.confirmedDocumentId])).toEqual([
      [transaction.id, document.id],
      [null, null],
    ]);
  });

  it('does nothing for an empty list', async () => {
    const document = await createDocument();
    await repository.createMany(document.id, []);
    expect(await db.documentMatch.count()).toBe(0);
  });

  it('throws when auto-confirming a transaction that already has a confirmed document', async () => {
    const { transaction } = await createTransactionGraph();
    const confirmed = { status: 'CONFIRMED' as const, decidedBy: 'reviewer:a', decidedAt: DECIDED_AT };
    await repository.createMany((await createDocument()).id, [newMatch(transaction.id, confirmed)]);
    const second = await createDocument();
    await expect(repository.createMany(second.id, [newMatch(transaction.id, confirmed)])).rejects.toThrow(
      /confirmedTransactionId/,
    );
    expect(await db.documentMatch.count({ where: { documentId: second.id } })).toBe(0);
  });
});

describe('PrismaMatchRepository reads', () => {
  it('returns null / an empty list for unknown ids', async () => {
    expect(await repository.findById(999)).toBeNull();
    expect(await repository.listForDocument(999)).toEqual([]);
  });

  it('finds a match by id', async () => {
    const { top } = await candidatesFixture();
    expect(await repository.findById(top.id)).toEqual(top);
  });

  it.each([
    ['signals with a non-number', { signals: { amount: 'high' } }, 'signals'],
    ['signals out of range', { signals: { amount: 1.5 } }, 'signals'],
    ['an unknown flag', { flags: ['MYSTERY'] }, 'flags'],
  ])('throws on corrupt stored JSON (%s)', async (_label, corrupt, field) => {
    const { top } = await candidatesFixture();
    await db.documentMatch.update({ where: { id: top.id }, data: corrupt });
    await expect(repository.findById(top.id)).rejects.toThrow(
      `Corrupt stored JSON in DocumentMatch ${top.id}.${field}`,
    );
  });
});

describe('PrismaMatchRepository.decide', () => {
  it('confirms a candidate and claims the confirmed slots', async () => {
    const { document, first, top } = await candidatesFixture();
    const result = await repository.decide({
      id: top.id,
      to: 'CONFIRMED',
      decidedBy: 'reviewer:a',
      decidedAt: DECIDED_AT,
    });
    expect(result).toEqual({ kind: 'updated' });
    const row = await db.documentMatch.findUniqueOrThrow({ where: { id: top.id } });
    expect(row).toMatchObject({
      status: 'CONFIRMED',
      decidedBy: 'reviewer:a',
      decidedAt: DECIDED_AT,
      confirmedTransactionId: first.id,
      confirmedDocumentId: document.id,
    });
  });

  it('rejects a candidate without claiming the confirmed slots', async () => {
    const { top } = await candidatesFixture();
    expect(
      await repository.decide({ id: top.id, to: 'REJECTED', decidedBy: 'reviewer:a', decidedAt: DECIDED_AT }),
    ).toEqual({
      kind: 'updated',
    });
    expect(await db.documentMatch.findUniqueOrThrow({ where: { id: top.id } })).toMatchObject({
      status: 'REJECTED',
      confirmedTransactionId: null,
    });
  });

  it('is stale when the match was already decided (double-submit)', async () => {
    const { top } = await candidatesFixture();
    const decision = { id: top.id, to: 'CONFIRMED' as const, decidedBy: 'reviewer:a', decidedAt: DECIDED_AT };
    await repository.decide(decision);
    expect(await repository.decide({ ...decision, decidedBy: 'reviewer:b' })).toEqual({ kind: 'stale' });
    expect((await repository.findById(top.id))?.decidedBy).toBe('reviewer:a');
  });

  it('is stale for an unknown match', async () => {
    expect(await repository.decide({ id: 404, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT })).toEqual({
      kind: 'stale',
    });
  });

  it('reports a conflict when the transaction already has a confirmed document', async () => {
    const { first, top } = await candidatesFixture();
    const otherDocument = await createDocument();
    await repository.createMany(otherDocument.id, [
      newMatch(first.id, { status: 'CONFIRMED', decidedBy: 'reviewer:seed', decidedAt: DECIDED_AT }),
    ]);
    expect(await repository.decide({ id: top.id, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT })).toEqual({
      kind: 'conflict',
      field: 'confirmedTransactionId',
    });
    expect((await repository.findById(top.id))?.status).toBe('CANDIDATE');
  });

  it('reports a conflict when the document already has a confirmed transaction', async () => {
    const { top, runnerUp } = await candidatesFixture();
    await repository.decide({ id: top.id, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT });
    expect(
      await repository.decide({ id: runnerUp.id, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT }),
    ).toEqual({
      kind: 'conflict',
      field: 'confirmedDocumentId',
    });
  });

  it('rethrows errors that are not uniqueness conflicts', async () => {
    const { top } = await candidatesFixture();
    const broken = new PrismaMatchRepository({
      documentMatch: {
        findUnique: () => Promise.resolve({ status: 'CANDIDATE', transactionId: 1, documentId: 1 }),
        updateMany: () => Promise.reject(new Error('disk full')),
      },
    } as unknown as typeof db);
    await expect(broken.decide({ id: top.id, to: 'REJECTED', decidedBy: 'r', decidedAt: DECIDED_AT })).rejects.toThrow(
      'disk full',
    );
  });

  it('is stale when another decision lands between the read and the guarded write', async () => {
    const racing = new PrismaMatchRepository({
      documentMatch: {
        findUnique: () => Promise.resolve({ status: 'CANDIDATE', transactionId: 1, documentId: 1 }),
        updateMany: () => Promise.resolve({ count: 0 }),
      },
    } as unknown as typeof db);
    expect(await racing.decide({ id: 1, to: 'REJECTED', decidedBy: 'r', decidedAt: DECIDED_AT })).toEqual({
      kind: 'stale',
    });
  });
});

describe('PrismaMatchRepository.rejectPendingSiblings / countPending', () => {
  it('rejects every other pending candidate, leaving the chosen and decided ones untouched', async () => {
    const { document, top, runnerUp } = await candidatesFixture();
    const { client, card } = await createTransactionGraph();
    const third = await createTransaction(client.id, card.id);
    await repository.createMany(document.id, [
      newMatch(third.id, {
        rank: 3,
        status: 'REJECTED',
        decidedBy: 'system',
        decidedAt: new Date('2025-01-01T00:00:00Z'),
      }),
    ]);
    expect(await repository.countPending(document.id)).toBe(2);
    expect(await repository.rejectPendingSiblings(document.id, top.id, 'reviewer:a', DECIDED_AT)).toBe(1);
    const statuses = (await repository.listForDocument(document.id)).map((match) => [
      match.id,
      match.status,
      match.decidedBy,
    ]);
    expect(statuses).toEqual([
      [top.id, 'CANDIDATE', null],
      [runnerUp.id, 'REJECTED', 'reviewer:a'],
      [expect.any(Number), 'REJECTED', 'system'],
    ]);
    expect(await repository.countPending(document.id)).toBe(1);
  });

  it('returns 0 when there is nothing to reject or count', async () => {
    const document = await createDocument();
    expect(await repository.rejectPendingSiblings(document.id, 1, 'r', DECIDED_AT)).toBe(0);
    expect(await repository.countPending(document.id)).toBe(0);
  });
});

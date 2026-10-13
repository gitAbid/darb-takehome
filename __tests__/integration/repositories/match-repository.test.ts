import type { NewMatch } from '@/lib/repositories/records';
import { PrismaMatchRepository } from '@/lib/repositories/prisma/prisma-match-repository';
import { ConfirmedSlotTakenError } from '@/lib/repositories/repository-errors';

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

const CONFIRMED = { status: 'CONFIRMED' as const, decidedBy: 'reviewer:a', decidedAt: DECIDED_AT };

describe('PrismaMatchRepository', () => {
  it('stores ranked candidates with signals and flags; only confirmed statuses claim the confirmed slots', async () => {
    const { document, first, second, top, runnerUp } = await candidatesFixture();
    expect(top).toEqual({ id: expect.any(Number), documentId: document.id, ...newMatch(first.id, { rank: 1 }) });
    expect(runnerUp).toMatchObject({ transactionId: second.id, rank: 2, flags: ['CARD_POSSIBLE_MISREAD'] });
    const auto = await createDocument();
    await repository.createMany(auto.id, [
      newMatch(first.id, { status: 'AUTO_CONFIRMED', decidedBy: 'system', decidedAt: DECIDED_AT }),
      newMatch(second.id, { rank: 2, status: 'REJECTED', decidedBy: 'system', decidedAt: DECIDED_AT }),
    ]);
    const rows = await db.documentMatch.findMany({ where: { documentId: auto.id }, orderBy: { rank: 'asc' } });
    expect(rows.map((row) => [row.confirmedTransactionId, row.confirmedDocumentId])).toEqual([
      [first.id, auto.id],
      [null, null],
    ]);
    await repository.createMany(auto.id, []);
    expect(await db.documentMatch.count({ where: { documentId: auto.id } })).toBe(2);
  });

  it('refuses to auto-confirm a transaction that already has a confirmed document, writing nothing', async () => {
    const { transaction } = await createTransactionGraph();
    await repository.createMany((await createDocument()).id, [newMatch(transaction.id, CONFIRMED)]);
    const second = await createDocument();
    const attempt = repository.createMany(second.id, [newMatch(transaction.id, CONFIRMED)]);
    await expect(attempt).rejects.toEqual(new ConfirmedSlotTakenError('confirmedTransactionId'));
    expect(await db.documentMatch.count({ where: { documentId: second.id } })).toBe(0);
    const undecided = newMatch(transaction.id, { status: 'REJECTED' }); // CHECK: decided without who/when
    await expect(repository.createMany(second.id, [undecided])).rejects.toThrow(/CHECK constraint/);
  });

  it('reads matches back, returns nothing for unknown ids, and refuses corrupt stored JSON', async () => {
    expect(await repository.findById(999)).toBeNull();
    expect(await repository.listForDocument(999)).toEqual([]);
    const { top } = await candidatesFixture();
    expect(await repository.findById(top.id)).toEqual(top);
    for (const [corrupt, field] of [
      [{ signals: { amount: 'high' } }, 'signals'],
      [{ signals: { amount: 1.5 } }, 'signals'],
      [{ signals: {}, flags: ['MYSTERY'] }, 'flags'],
    ] as const) {
      await db.documentMatch.update({ where: { id: top.id }, data: corrupt });
      await expect(repository.findById(top.id)).rejects.toThrow(
        `Corrupt stored JSON in DocumentMatch ${top.id}.${field}`,
      );
    }
  });

  it('confirming claims the confirmed slots; rejecting does not', async () => {
    const { document, first, top, runnerUp } = await candidatesFixture();
    expect(
      await repository.decide({ id: top.id, to: 'CONFIRMED', decidedBy: 'reviewer:a', decidedAt: DECIDED_AT }),
    ).toEqual({
      kind: 'updated',
    });
    expect(await db.documentMatch.findUniqueOrThrow({ where: { id: top.id } })).toMatchObject({
      status: 'CONFIRMED',
      decidedBy: 'reviewer:a',
      confirmedTransactionId: first.id,
      confirmedDocumentId: document.id,
    });
    await repository.decide({ id: runnerUp.id, to: 'REJECTED', decidedBy: 'reviewer:a', decidedAt: DECIDED_AT });
    expect(await db.documentMatch.findUniqueOrThrow({ where: { id: runnerUp.id } })).toMatchObject({
      status: 'REJECTED',
      confirmedTransactionId: null,
    });
  });

  it('reports a double-submit, an unknown match or a lost race as stale, and never overwrites a decision', async () => {
    const { top } = await candidatesFixture();
    const decision = { id: top.id, to: 'CONFIRMED' as const, decidedBy: 'reviewer:a', decidedAt: DECIDED_AT };
    await repository.decide(decision);
    expect(await repository.decide({ ...decision, decidedBy: 'reviewer:b' })).toEqual({ kind: 'stale' });
    expect((await repository.findById(top.id))?.decidedBy).toBe('reviewer:a');
    expect(await repository.decide({ ...decision, id: 404 })).toEqual({ kind: 'stale' });
    const fakeDb = (updateMany: () => Promise<unknown>) =>
      new PrismaMatchRepository({
        documentMatch: {
          findUnique: () => Promise.resolve({ status: 'CANDIDATE', transactionId: 1, documentId: 1 }),
          updateMany,
        },
      } as unknown as typeof db);
    expect(await fakeDb(() => Promise.resolve({ count: 0 })).decide({ ...decision, id: 1 })).toEqual({ kind: 'stale' });
    await expect(fakeDb(() => Promise.reject(new Error('disk full'))).decide({ ...decision, id: 1 })).rejects.toThrow(
      'disk full',
    );
  });

  it('reports a confirmation conflict when the transaction or the document already has a confirmed match', async () => {
    const { first, top, runnerUp } = await candidatesFixture();
    await repository.createMany((await createDocument()).id, [newMatch(first.id, CONFIRMED)]);
    expect(await repository.decide({ id: top.id, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT })).toEqual({
      kind: 'conflict',
      field: 'confirmedTransactionId',
    });
    expect((await repository.findById(top.id))?.status).toBe('CANDIDATE');
    await repository.decide({ id: runnerUp.id, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT });
    const sibling = await candidatesFixture();
    await repository.decide({ id: sibling.top.id, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT });
    expect(
      await repository.decide({ id: sibling.runnerUp.id, to: 'CONFIRMED', decidedBy: 'r', decidedAt: DECIDED_AT }),
    ).toEqual({ kind: 'conflict', field: 'confirmedDocumentId' });
  });

  it('rejects every other pending candidate of a document, leaving the chosen and decided ones untouched', async () => {
    const { document, top, runnerUp } = await candidatesFixture();
    const { client, card } = await createTransactionGraph();
    const third = await createTransaction(client.id, card.id);
    await repository.createMany(document.id, [
      newMatch(third.id, { rank: 3, status: 'REJECTED', decidedBy: 'system', decidedAt: DECIDED_AT }),
    ]);
    expect(await repository.countPending(document.id)).toBe(2);
    expect(await repository.rejectPendingSiblings(document.id, top.id, 'reviewer:a', DECIDED_AT)).toBe(1);
    expect(
      (await repository.listForDocument(document.id)).map((match) => [match.id, match.status, match.decidedBy]),
    ).toEqual([
      [top.id, 'CANDIDATE', null],
      [runnerUp.id, 'REJECTED', 'reviewer:a'],
      [expect.any(Number), 'REJECTED', 'system'],
    ]);
    const empty = await createDocument();
    expect(await repository.rejectPendingSiblings(empty.id, 1, 'r', DECIDED_AT)).toBe(0);
    expect(await repository.countPending(empty.id)).toBe(0);
  });
});

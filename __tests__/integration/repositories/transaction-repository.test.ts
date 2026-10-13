import { PrismaTransactionRepository } from '@/lib/repositories/prisma/prisma-transaction-repository';
import type { CandidateQuery } from '@/lib/repositories/records';

import { createCard, createClient, createTransaction, db, resetDatabase } from '../../helpers/test-database';

const repository = new PrismaTransactionRepository(db);

function query(overrides: Partial<CandidateQuery> = {}): CandidateQuery {
  return {
    clientIds: [],
    driverPhone: null,
    from: new Date('2025-06-01T00:00:00Z'),
    to: new Date('2025-06-30T23:59:59Z'),
    ...overrides,
  };
}

beforeEach(resetDatabase);
afterAll(() => db.$disconnect());

describe('PrismaTransactionRepository.findCandidates', () => {
  it('returns [] for an empty scope without touching the database', async () => {
    const spy = jest.spyOn(db.transaction, 'findMany');
    expect(await repository.findCandidates(query())).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('includes both date bounds, excludes outside them, and orders by time then id', async () => {
    const client = await createClient();
    const card = await createCard(client.id);
    const at = (iso: string) => createTransaction(client.id, card.id, { transactionAt: new Date(iso) });
    const onTo = await at('2025-06-30T23:59:59Z');
    const sameTimeA = await at('2025-06-11T08:00:00Z');
    const sameTimeB = await at('2025-06-11T08:00:00Z');
    const onFrom = await at('2025-06-01T00:00:00Z');
    await at('2025-05-31T23:59:59Z');
    await at('2025-07-01T00:00:00Z');
    const found = await repository.findCandidates(query({ clientIds: [client.id] }));
    expect(found.map((candidate) => candidate.id)).toEqual([onFrom.id, sameTimeA.id, sameTimeB.id, onTo.id]);
  });
});

import { PrismaTransactionRepository } from '@/lib/repositories/prisma/prisma-transaction-repository';
import { seedDatabase } from '@/prisma/seed-data/seed-database';
import * as seedPlan from '@/prisma/seed-data/seed-plan';

import { db } from '../helpers/test-database';

afterAll(() => db.$disconnect());

async function snapshot() {
  return {
    clients: await db.client.findMany({ orderBy: { id: 'asc' } }),
    senderEmails: await db.clientSenderEmail.findMany({
      orderBy: { email: 'asc' },
      select: { clientId: true, email: true },
    }),
    drivers: await db.driver.findMany({ orderBy: { phone: 'asc' }, select: { clientId: true, phone: true } }),
    cards: await db.card.findMany({ orderBy: { id: 'asc' } }),
    transactions: await db.transaction.findMany({ orderBy: { id: 'asc' }, omit: { createdAt: true } }),
    documents: await db.document.findMany({ orderBy: { id: 'asc' }, omit: { receivedAt: true, updatedAt: true } }),
    matches: await db.documentMatch.findMany({ orderBy: { id: 'asc' }, omit: { createdAt: true } }),
  };
}

describe('seedDatabase', () => {
  it('loads the scenario data set (docs/SCENARIOS.md §1)', async () => {
    expect(await seedDatabase(db)).toEqual({
      clients: 2,
      senderEmails: 2,
      drivers: 4,
      cards: 5,
      transactions: 15,
      documents: 1,
      matches: 1,
    });
    expect(await db.transaction.count()).toBe(15);
    const sd1 = await db.document.findFirstOrThrow({ include: { matches: true } });
    expect(sd1).toMatchObject({ status: 'MATCHED', source: 'WHATSAPP', externalId: 'wamid.seed-0001' });
    expect(sd1.matches).toEqual([
      expect.objectContaining({
        transactionId: 7,
        status: 'CONFIRMED',
        confirmedTransactionId: 7,
        decidedBy: 'reviewer:seed',
      }),
    ]);
  });

  it('is idempotent: seeding twice leaves identical data', async () => {
    await seedDatabase(db);
    const first = await snapshot();
    await seedDatabase(db);
    expect(await snapshot()).toEqual(first);
  });

  it('replaces data created after a previous seed', async () => {
    await seedDatabase(db);
    await db.client.create({ data: { name: 'Extra', slug: 'extra' } });
    await seedDatabase(db);
    expect(await db.client.count()).toBe(2);
  });

  it('marks T07 as already having a confirmed document', async () => {
    await seedDatabase(db);
    const candidates = await new PrismaTransactionRepository(db).findCandidates({
      clientIds: [1],
      driverPhone: null,
      from: new Date('2025-06-01T00:00:00Z'),
      to: new Date('2025-06-30T00:00:00Z'),
    });
    const confirmed = candidates.filter((candidate) => candidate.hasConfirmedDocument).map((candidate) => candidate.id);
    expect(confirmed).toEqual([7]);
  });

  it('rolls back completely when an insert fails part-way (wipe included)', async () => {
    await seedDatabase(db);
    const before = await snapshot();
    const plan = seedPlan.buildSeedPlan();
    const brokenPlan = { ...plan, matches: plan.matches.map((match) => ({ ...match, confidence: 2 })) };
    const spy = jest.spyOn(seedPlan, 'buildSeedPlan').mockReturnValueOnce(brokenPlan);
    await expect(seedDatabase(db)).rejects.toThrow(/CHECK constraint failed/);
    spy.mockRestore();
    expect(await snapshot()).toEqual(before);
  });
});

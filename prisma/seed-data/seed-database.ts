import type { Prisma, PrismaClient } from '@prisma/client';

import { buildSeedPlan, type SeedPlan } from './seed-plan';

export type SeedSummary = Record<keyof SeedPlan, number>;

/** Replaces all data with the seed plan, atomically. Running it twice leaves identical data. */
export async function seedDatabase(db: PrismaClient): Promise<SeedSummary> {
  const plan = buildSeedPlan();
  await db.$transaction(async (tx) => {
    await wipe(tx);
    await insert(tx, plan);
  });
  return summarize(plan);
}

async function wipe(tx: Prisma.TransactionClient): Promise<void> {
  await tx.documentMatch.deleteMany();
  await tx.document.deleteMany();
  await tx.transaction.deleteMany();
  await tx.card.deleteMany();
  await tx.driver.deleteMany();
  await tx.clientSenderEmail.deleteMany();
  await tx.client.deleteMany();
}

async function insert(tx: Prisma.TransactionClient, plan: SeedPlan): Promise<void> {
  await tx.client.createMany({ data: plan.clients });
  await tx.clientSenderEmail.createMany({ data: plan.senderEmails });
  await tx.driver.createMany({ data: plan.drivers });
  await tx.card.createMany({ data: plan.cards });
  await tx.transaction.createMany({ data: plan.transactions });
  await tx.document.createMany({ data: plan.documents });
  await tx.documentMatch.createMany({ data: plan.matches });
}

function summarize(plan: SeedPlan): SeedSummary {
  return {
    clients: plan.clients.length,
    senderEmails: plan.senderEmails.length,
    drivers: plan.drivers.length,
    cards: plan.cards.length,
    transactions: plan.transactions.length,
    documents: plan.documents.length,
    matches: plan.matches.length,
  };
}

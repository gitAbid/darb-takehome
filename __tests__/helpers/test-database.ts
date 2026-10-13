import type { Prisma } from '@prisma/client';

import prisma from '@/lib/prisma';

/** The Prisma client bound to this test file's private database. */
export const db = prisma;

/** Deletes every row, children first, so each test starts empty. */
export async function resetDatabase(): Promise<void> {
  await db.documentMatch.deleteMany();
  await db.document.deleteMany();
  await db.transaction.deleteMany();
  await db.card.deleteMany();
  await db.driver.deleteMany();
  await db.clientSenderEmail.deleteMany();
  await db.client.deleteMany();
}

export async function createClient(overrides: Partial<Prisma.ClientUncheckedCreateInput> = {}) {
  return db.client.create({ data: { name: 'Najd Logistics', slug: `najd-${Math.random()}`, ...overrides } });
}

export async function createCard(clientId: number, overrides: Partial<Prisma.CardUncheckedCreateInput> = {}) {
  return db.card.create({ data: { clientId, last4: '4471', label: 'Truck', ...overrides } });
}

export async function createTransaction(
  clientId: number,
  cardId: number,
  overrides: Partial<Prisma.TransactionUncheckedCreateInput> = {},
) {
  return db.transaction.create({
    data: {
      clientId,
      cardId,
      driverPhone: '+966551234567',
      merchantName: 'ALFANAR FUEL ST 04 RUH',
      mcc: '5541',
      amount: 15000,
      transactionAt: new Date('2025-06-10T07:42:00Z'),
      ...overrides,
    },
  });
}

let documentSequence = 0;

export async function createDocument(overrides: Partial<Prisma.DocumentUncheckedCreateInput> = {}) {
  documentSequence += 1;
  return db.document.create({
    data: {
      source: 'WHATSAPP',
      externalId: `wamid.test-${documentSequence}`,
      contentHash: `hash-${documentSequence}`,
      senderIdentifier: '+966551234567',
      mimeType: 'image/jpeg',
      ...overrides,
    },
  });
}

/** A client with one card and one transaction — the smallest graph most repository tests need. */
export async function createTransactionGraph() {
  const client = await createClient();
  const card = await createCard(client.id);
  const transaction = await createTransaction(client.id, card.id);
  return { client, card, transaction };
}

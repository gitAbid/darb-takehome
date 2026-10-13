import type { Prisma } from '@prisma/client';

import { CARDS } from './cards';
import { CLIENTS, SENDER_EMAILS } from './clients';
import { CONFIRMED_DOCUMENTS } from './documents';
import { DRIVERS } from './drivers';
import { TRANSACTIONS } from './transactions';
import type { SeedConfirmedDocument, SeedTransaction } from './types';

const FULL_MATCH_SIGNALS = { amount: 1, date: 1, merchant: 1, card: 1, scope: 1 };

/** Every row the seed inserts, in insertion order. Pure: no database access, so it is directly testable. */
export interface SeedPlan {
  clients: Prisma.ClientCreateManyInput[];
  senderEmails: Prisma.ClientSenderEmailCreateManyInput[];
  drivers: Prisma.DriverCreateManyInput[];
  cards: Prisma.CardCreateManyInput[];
  transactions: Prisma.TransactionCreateManyInput[];
  documents: Prisma.DocumentCreateManyInput[];
  matches: Prisma.DocumentMatchCreateManyInput[];
}

/** Builds the seed rows from prisma/seed-data (docs/SCENARIOS.md §1). Ids are explicit so re-seeding is identical. */
export function buildSeedPlan(): SeedPlan {
  return {
    clients: CLIENTS.map(({ id, name, slug }) => ({ id, name, slug })),
    senderEmails: SENDER_EMAILS.map(({ clientId, email }) => ({ clientId, email: email.toLowerCase() })),
    drivers: Object.values(DRIVERS).map(({ clientId, phone }) => ({ clientId, phone })),
    cards: CARDS.map(({ id, clientId, last4, label }) => ({ id, clientId, last4, label })),
    transactions: TRANSACTIONS.map(toTransactionRow),
    documents: CONFIRMED_DOCUMENTS.map((document, index) => toDocumentRow(document, index + 1)),
    matches: CONFIRMED_DOCUMENTS.map((document, index) => toConfirmedMatchRow(document, index + 1)),
  };
}

function toTransactionRow(transaction: SeedTransaction): Prisma.TransactionCreateManyInput {
  const { id, clientId, cardId, driverPhone, merchantName, mcc, amount, currency, transactionAt } = transaction;
  return { id, clientId, cardId, driverPhone, merchantName, mcc, amount, currency, transactionAt };
}

function toDocumentRow(document: SeedConfirmedDocument, id: number): Prisma.DocumentCreateManyInput {
  return {
    id,
    source: 'WHATSAPP',
    externalId: document.externalId,
    contentHash: `seed:${document.ref}`,
    senderIdentifier: document.senderIdentifier,
    clientId: document.clientId,
    status: 'MATCHED',
    decisionReasons: [],
    mimeType: 'image/jpeg',
    documentType: 'RECEIPT',
    merchantName: document.merchantName,
    totalAmount: document.totalAmount,
    currency: 'SAR',
    documentDate: new Date(`${document.documentDate}T00:00:00Z`),
    cardLast4: document.cardLast4,
    extractionConfidence: 0.9,
  };
}

function toConfirmedMatchRow(document: SeedConfirmedDocument, documentId: number): Prisma.DocumentMatchCreateManyInput {
  return {
    id: documentId,
    documentId,
    transactionId: document.confirmedTransactionId,
    rank: 1,
    confidence: 1,
    signals: FULL_MATCH_SIGNALS,
    flags: [],
    status: 'CONFIRMED',
    decidedBy: document.decidedBy,
    decidedAt: document.decidedAt,
    confirmedTransactionId: document.confirmedTransactionId,
    confirmedDocumentId: documentId,
  };
}

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CARDS } from '@/prisma/seed-data/cards';
import { CONFIRMED_DOCUMENTS } from '@/prisma/seed-data/documents';
import { TRANSACTIONS } from '@/prisma/seed-data/transactions';
import type { ExtractedDocument } from '@/lib/extraction/types';
import type { CandidateTransaction, ExtractedFields, SenderScope } from '@/lib/services/matching/types';

const SCENARIOS_DIR = join(__dirname, '..', '..', 'fixtures', 'scenarios');

/** The seeded transactions as the matcher sees them (card last4 joined, confirmed-document flag set). */
export function seededCandidates(): CandidateTransaction[] {
  const confirmed = new Set(CONFIRMED_DOCUMENTS.map((doc) => doc.confirmedTransactionId));
  return TRANSACTIONS.map((transaction) => ({
    id: transaction.id,
    clientId: transaction.clientId,
    driverPhone: transaction.driverPhone,
    cardLast4: cardLast4(transaction.cardId),
    merchantName: transaction.merchantName,
    mcc: transaction.mcc,
    amount: transaction.amount,
    currency: transaction.currency,
    transactionAt: transaction.transactionAt,
    hasConfirmedDocument: confirmed.has(transaction.id),
  }));
}

/** Reads fixtures/scenarios/<folder>/extraction.json and attaches the sender scope. */
export function scenarioFields(folder: string, scope: SenderScope): ExtractedFields {
  const raw = JSON.parse(readFileSync(join(SCENARIOS_DIR, folder, 'extraction.json'), 'utf8')) as {
    kind: string;
  } & ExtractedDocument;
  if (raw.kind !== 'result') throw new Error(`Fixture ${folder} is not an extraction result`);
  return { ...raw, scope };
}

/** Seed transaction id for a reference like 'T07'. */
export function txnId(ref: string): number {
  const transaction = TRANSACTIONS.find((candidate) => candidate.ref === ref);
  if (!transaction) throw new Error(`Unknown transaction ${ref}`);
  return transaction.id;
}

function cardLast4(cardId: number): string {
  const card = CARDS.find((candidate) => candidate.id === cardId);
  if (!card) throw new Error(`Unknown card ${cardId}`);
  return card.last4;
}

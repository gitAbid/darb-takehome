import { CONFIRMED_MATCH_STATUSES } from '@/lib/domain/statuses';
import type { CandidateTransaction } from '@/lib/services/matching/types';

import type { CandidateQuery, InsertTransactionResult, NewTransaction } from '../records';
import type { TransactionRepository } from '../transaction-repository';
import { uniqueViolationFields } from './map-prisma-error';
import type { PrismaDb } from './prisma-db';

interface TransactionRow {
  id: number;
  clientId: number;
  driverPhone: string | null;
  merchantName: string;
  mcc: string;
  amount: number;
  currency: string;
  transactionAt: Date;
  card: { last4: string };
  documents: { id: number }[];
}

export class PrismaTransactionRepository implements TransactionRepository {
  constructor(private readonly db: PrismaDb) {}

  async findCandidates(query: CandidateQuery): Promise<CandidateTransaction[]> {
    if (query.clientIds.length === 0) return [];
    const rows = await this.db.transaction.findMany({
      where: {
        clientId: { in: [...query.clientIds] },
        ...(query.driverPhone !== null && { driverPhone: query.driverPhone }),
        transactionAt: { gte: query.from, lte: query.to },
      },
      include: {
        card: { select: { last4: true } },
        documents: { where: { status: { in: [...CONFIRMED_MATCH_STATUSES] } }, select: { id: true }, take: 1 },
      },
      orderBy: [{ transactionAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toCandidate);
  }

  async insert(transaction: NewTransaction): Promise<InsertTransactionResult> {
    try {
      const { id } = await this.db.transaction.create({ data: transaction, select: { id: true } });
      return { kind: 'created', id };
    } catch (error) {
      if (!uniqueViolationFields(error)?.includes('externalRef')) throw error;
      const existing = await this.db.transaction.findUniqueOrThrow({
        where: { externalRef: transaction.externalRef },
        select: { id: true },
      });
      return { kind: 'duplicate', id: existing.id };
    }
  }

  async cardBelongsToClient(cardId: number, clientId: number): Promise<boolean> {
    return (await this.db.card.count({ where: { id: cardId, clientId } })) === 1;
  }
}

function toCandidate(row: TransactionRow): CandidateTransaction {
  return {
    id: row.id,
    clientId: row.clientId,
    driverPhone: row.driverPhone,
    cardLast4: row.card.last4,
    merchantName: row.merchantName,
    mcc: row.mcc,
    amount: row.amount,
    currency: row.currency,
    transactionAt: row.transactionAt,
    hasConfirmedDocument: row.documents.length > 0,
  };
}

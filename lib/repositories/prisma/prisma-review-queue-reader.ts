import { DOCUMENT_STATUSES, type DocumentStatus } from '@/lib/domain/statuses';

import type { QueueItem, ReviewDocument, ReviewQueueReader } from '../review-queue-reader';
import { toStoredDocument } from './document-mapper';
import { toStoredMatch } from './match-mapper';
import type { PrismaDb } from './prisma-db';

export class PrismaReviewQueueReader implements ReviewQueueReader {
  constructor(private readonly db: PrismaDb) {}

  async listQueue(limit: number): Promise<QueueItem[]> {
    const rows = await this.db.document.findMany({
      where: { status: 'NEEDS_REVIEW' },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
      take: limit,
      include: { _count: { select: { matches: { where: { status: 'CANDIDATE' } } } } },
    });
    return rows.map((row) => {
      const document = toStoredDocument(row);
      return {
        documentId: document.id,
        source: document.source,
        senderIdentifier: document.senderIdentifier,
        receivedAt: document.receivedAt,
        merchantName: document.extraction?.merchantName ?? null,
        totalAmount: document.extraction?.totalAmount ?? null,
        currency: document.extraction?.currency ?? null,
        documentDate: document.extraction?.documentDate ?? null,
        reasons: document.decisionReasons,
        pendingCandidates: row._count.matches,
      };
    });
  }

  async findDocument(documentId: number): Promise<ReviewDocument | null> {
    const row = await this.db.document.findUnique({
      where: { id: documentId },
      include: {
        matches: {
          orderBy: [{ rank: 'asc' }, { id: 'asc' }],
          include: { transaction: { include: { card: { select: { last4: true, label: true } } } } },
        },
      },
    });
    if (row === null) return null;
    const document = toStoredDocument(row);
    return {
      documentId: document.id,
      status: document.status,
      source: document.source,
      senderIdentifier: document.senderIdentifier,
      recipientIdentifier: document.recipientIdentifier,
      receivedAt: document.receivedAt,
      mimeType: document.mimeType,
      hasFile: document.storageKey !== null,
      extraction: document.extraction,
      reasons: document.decisionReasons,
      candidates: row.matches.map((match) => {
        const { transaction } = match;
        const stored = toStoredMatch(match);
        return {
          matchId: stored.id,
          rank: stored.rank,
          confidence: stored.confidence,
          signals: stored.signals,
          flags: stored.flags,
          status: stored.status,
          transaction: {
            id: transaction.id,
            merchantName: transaction.merchantName,
            mcc: transaction.mcc,
            amount: transaction.amount,
            currency: transaction.currency,
            transactionAt: transaction.transactionAt,
            cardLast4: transaction.card.last4,
            cardLabel: transaction.card.label,
            driverPhone: transaction.driverPhone,
          },
        };
      }),
    };
  }

  async countByStatus(): Promise<Record<DocumentStatus, number>> {
    const groups = await this.db.document.groupBy({ by: ['status'], _count: { _all: true } });
    const counts = Object.fromEntries(DOCUMENT_STATUSES.map((status) => [status, 0])) as Record<DocumentStatus, number>;
    for (const group of groups) counts[group.status] = group._count._all;
    return counts;
  }
}

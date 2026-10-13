import type { MatchRepository } from '../match-repository';
import type { MatchDecision, MatchDecisionResult, NewMatch, StoredMatch } from '../records';
import { ConfirmedSlotTakenError } from '../repository-errors';
import { uniqueViolationFields } from './map-prisma-error';
import { toDecisionData, toMatchCreateInput, toStoredMatch } from './match-mapper';
import type { PrismaDb } from './prisma-db';

const CONFLICT_FIELDS = ['confirmedTransactionId', 'confirmedDocumentId'] as const;

type ConflictField = (typeof CONFLICT_FIELDS)[number];

export class PrismaMatchRepository implements MatchRepository {
  constructor(private readonly db: PrismaDb) {}

  /** One createMany statement: the candidate list is written atomically even outside a unit of work. */
  async createMany(documentId: number, matches: readonly NewMatch[]): Promise<void> {
    if (matches.length === 0) return;
    try {
      await this.db.documentMatch.createMany({ data: matches.map((match) => toMatchCreateInput(documentId, match)) });
    } catch (error) {
      const field = conflictField(error);
      if (field) throw new ConfirmedSlotTakenError(field);
      throw error;
    }
  }

  async findById(id: number): Promise<StoredMatch | null> {
    const row = await this.db.documentMatch.findUnique({ where: { id } });
    return row === null ? null : toStoredMatch(row);
  }

  async listForDocument(documentId: number): Promise<StoredMatch[]> {
    const rows = await this.db.documentMatch.findMany({
      where: { documentId },
      orderBy: [{ rank: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toStoredMatch);
  }

  async decide(decision: MatchDecision): Promise<MatchDecisionResult> {
    const row = await this.db.documentMatch.findUnique({
      where: { id: decision.id },
      select: { status: true, transactionId: true, documentId: true },
    });
    if (row === null || row.status !== 'CANDIDATE') return { kind: 'stale' };
    return this.applyDecision(decision, row);
  }

  async rejectPendingSiblings(
    documentId: number,
    exceptMatchId: number,
    decidedBy: string,
    decidedAt: Date,
  ): Promise<number> {
    const { count } = await this.db.documentMatch.updateMany({
      where: { documentId, status: 'CANDIDATE', id: { not: exceptMatchId } },
      data: { status: 'REJECTED', decidedBy, decidedAt },
    });
    return count;
  }

  countPending(documentId: number): Promise<number> {
    return this.db.documentMatch.count({ where: { documentId, status: 'CANDIDATE' } });
  }

  /** Guarded on status = CANDIDATE so a concurrent decision makes this one stale instead of overwriting it. */
  private async applyDecision(
    decision: MatchDecision,
    row: { transactionId: number; documentId: number },
  ): Promise<MatchDecisionResult> {
    try {
      const { count } = await this.db.documentMatch.updateMany({
        where: { id: decision.id, status: 'CANDIDATE' },
        data: toDecisionData(decision, row),
      });
      return count === 1 ? { kind: 'updated' } : { kind: 'stale' };
    } catch (error) {
      const field = conflictField(error);
      if (field === null) throw error;
      return { kind: 'conflict', field };
    }
  }
}

function conflictField(error: unknown): ConflictField | null {
  const fields = uniqueViolationFields(error) ?? [];
  return CONFLICT_FIELDS.find((field) => fields.includes(field)) ?? null;
}

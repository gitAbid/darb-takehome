import type { DocumentMatch as MatchRow, Prisma } from '@prisma/client';
import { z } from 'zod';

import { CANDIDATE_FLAGS } from '@/lib/domain/reason-codes';
import { isConfirmedMatchStatus } from '@/lib/domain/statuses';

import type { MatchDecision, NewMatch, StoredMatch } from '../records';
import { parseStoredJson } from './document-mapper';

const signalsSchema = z.record(z.string(), z.number().min(0).max(1));
const flagsSchema = z.array(z.enum(CANDIDATE_FLAGS));

/** Confirmed statuses also claim the unique confirmed* slots that enforce one confirmed pair per side. */
export function toMatchCreateInput(documentId: number, match: NewMatch): Prisma.DocumentMatchCreateManyInput {
  const confirmed = isConfirmedMatchStatus(match.status);
  return {
    documentId,
    transactionId: match.transactionId,
    rank: match.rank,
    confidence: match.confidence,
    signals: match.signals,
    flags: [...match.flags],
    status: match.status,
    decidedBy: match.decidedBy,
    decidedAt: match.decidedAt,
    confirmedTransactionId: confirmed ? match.transactionId : null,
    confirmedDocumentId: confirmed ? documentId : null,
  };
}

export function toDecisionData(
  decision: MatchDecision,
  row: Pick<MatchRow, 'transactionId' | 'documentId'>,
): Prisma.DocumentMatchUncheckedUpdateManyInput {
  const confirmed = decision.to === 'CONFIRMED';
  return {
    status: decision.to,
    decidedBy: decision.decidedBy,
    decidedAt: decision.decidedAt,
    confirmedTransactionId: confirmed ? row.transactionId : null,
    confirmedDocumentId: confirmed ? row.documentId : null,
  };
}

export function toStoredMatch(row: MatchRow): StoredMatch {
  return {
    id: row.id,
    documentId: row.documentId,
    transactionId: row.transactionId,
    rank: row.rank,
    confidence: row.confidence,
    signals: parseStoredJson(signalsSchema, row.signals, `DocumentMatch ${row.id}.signals`),
    flags: parseStoredJson(flagsSchema, row.flags, `DocumentMatch ${row.id}.flags`),
    status: row.status,
    decidedBy: row.decidedBy,
    decidedAt: row.decidedAt,
  };
}

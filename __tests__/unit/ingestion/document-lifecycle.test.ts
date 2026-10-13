import type { DocumentRepository } from '@/lib/repositories/document-repository';
import {
  changeDocumentStatus,
  IllegalTransitionError,
  StaleDocumentError,
} from '@/lib/services/ingestion/document-state-machine';
import { demoteToReview, documentStatusFor, matchesToPersist } from '@/lib/services/ingestion/match-persistence';
import type { MatchResult } from '@/lib/services/matching/types';

const repository = (changed: boolean): DocumentRepository & { changeStatus: jest.Mock } => ({
  insert: jest.fn(),
  findById: jest.fn(),
  changeStatus: jest.fn().mockResolvedValue(changed),
});

describe('document state machine', () => {
  it('refuses transitions that are not in the lifecycle, without writing', async () => {
    const documents = repository(true);
    await expect(changeDocumentStatus(documents, { id: 1, from: 'MATCHED', to: 'UNMATCHED' })).rejects.toThrow(
      IllegalTransitionError,
    );
    await expect(changeDocumentStatus(documents, { id: 1, from: 'RECEIVED', to: 'MATCHED' })).rejects.toThrow(
      IllegalTransitionError,
    );
    expect(documents.changeStatus).not.toHaveBeenCalled();
  });

  it('fails loudly when another worker already moved the document', async () => {
    await expect(changeDocumentStatus(repository(false), { id: 1, from: 'RECEIVED', to: 'EXTRACTED' })).rejects.toThrow(
      StaleDocumentError,
    );
  });
});

describe('match persistence', () => {
  const at = new Date('2025-06-20T09:00:00Z');
  const result = (outcome: MatchResult['outcome']): MatchResult => ({
    outcome,
    reasons: [],
    excluded: { scope: 0, currency: 0, dateWindow: 0, amount: 0, card: 0 },
    candidates: [
      { transactionId: 1, confidence: 1, signals: { amount: 1 }, flags: [] },
      { transactionId: 3, confidence: 0.88, signals: { amount: 1 }, flags: [] },
    ],
  });
  const statuses = (outcome: MatchResult['outcome']) =>
    matchesToPersist(result(outcome), at).map(({ transactionId, rank, status, decidedBy }) => [
      transactionId,
      rank,
      status,
      decidedBy,
    ]);

  it('auto-confirms the winner and system-rejects the runners-up; review keeps all candidates open', () => {
    expect(statuses('AUTO_MATCHED')).toEqual([
      [1, 1, 'AUTO_CONFIRMED', 'system'],
      [3, 2, 'REJECTED', 'system'],
    ]);
    expect(statuses('NEEDS_REVIEW')).toEqual([
      [1, 1, 'CANDIDATE', null],
      [3, 2, 'CANDIDATE', null],
    ]);
    expect(
      ['AUTO_MATCHED', 'NEEDS_REVIEW', 'UNMATCHED'].map((o) => documentStatusFor(o as MatchResult['outcome'])),
    ).toEqual(['MATCHED', 'NEEDS_REVIEW', 'UNMATCHED']);
  });

  it('demotes an auto-match that lost the confirmed slot to review', () => {
    expect(demoteToReview(result('AUTO_MATCHED'))).toMatchObject({
      outcome: 'NEEDS_REVIEW',
      reasons: ['TXN_ALREADY_HAS_DOCUMENT'],
    });
  });
});

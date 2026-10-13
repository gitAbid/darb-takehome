import type { Clock } from '@/lib/domain/clock';
import type { ExtractedDocument } from '@/lib/extraction/types';
import { ConfirmedSlotTakenError } from '@/lib/repositories/repository-errors';
import type { Repositories, UnitOfWork } from '@/lib/repositories/unit-of-work';
import { candidateWindow } from '@/lib/services/matching/candidate-window';
import type { DateRules } from '@/lib/services/matching/matching-config';
import type { MatchDocumentFn, MatchResult, SenderScope } from '@/lib/services/matching/types';

import { changeDocumentStatus } from './document-state-machine';
import { demoteToReview, documentStatusFor, matchesToPersist } from './match-persistence';

const UNKNOWN_SENDER_RESULT: MatchResult = {
  outcome: 'UNMATCHED',
  candidates: [],
  reasons: ['UNKNOWN_SENDER'],
  excluded: { scope: 0, currency: 0, dateWindow: 0, amount: 0, card: 0 },
};

export interface MatchStageDependencies {
  repositories: Repositories;
  unitOfWork: UnitOfWork;
  matchDocument: MatchDocumentFn;
  dateRules: Pick<DateRules, 'windows'>;
  clock: Clock;
}

export interface MatchStageInput {
  documentId: number;
  /** EXTRACTED for a new document; UNMATCHED when re-matching after new transactions arrived. */
  from: 'EXTRACTED' | 'UNMATCHED';
  extraction: ExtractedDocument;
  /** Null when the sender is unknown. */
  scope: SenderScope | null;
  /** Transactions already proposed for this document (incl. reviewer rejections): never proposed again. */
  excludeTransactionIds?: ReadonlySet<number>;
}

/**
 * Load candidates → match → persist matches and the new status atomically. Shared by first-time processing and by
 * re-matching, so both follow exactly the same rules.
 */
export class MatchStage {
  constructor(private readonly deps: MatchStageDependencies) {}

  async run(input: MatchStageInput): Promise<MatchResult> {
    const result = input.scope === null ? UNKNOWN_SENDER_RESULT : await this.match(input, input.scope);
    if (input.from === 'UNMATCHED' && result.outcome === 'UNMATCHED') return result;
    return this.persist(input, result);
  }

  private async match(input: MatchStageInput, scope: SenderScope): Promise<MatchResult> {
    const window = candidateWindow(input.extraction.documentDate, this.deps.dateRules);
    const loaded =
      window === null ? [] : await this.deps.repositories.transactions.findCandidates({ ...scope, ...window });
    const candidates = loaded.filter((transaction) => !input.excludeTransactionIds?.has(transaction.id));
    return this.deps.matchDocument({ ...input.extraction, scope }, candidates);
  }

  private async persist(input: MatchStageInput, result: MatchResult): Promise<MatchResult> {
    try {
      await this.save(input, result);
      return result;
    } catch (error) {
      if (!(error instanceof ConfirmedSlotTakenError)) throw error;
      const demoted = demoteToReview(result);
      await this.save(input, demoted);
      return demoted;
    }
  }

  private save({ documentId, from }: MatchStageInput, result: MatchResult): Promise<void> {
    return this.deps.unitOfWork.run(async ({ documents, matches }) => {
      await matches.createMany(documentId, matchesToPersist(result, this.deps.clock.now()));
      await changeDocumentStatus(documents, {
        id: documentId,
        from,
        to: documentStatusFor(result.outcome),
        decisionReasons: result.reasons,
      });
    });
  }
}

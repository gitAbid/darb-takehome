import type { AppConfig } from '@/lib/config/app-config';
import { createExtractor } from '@/lib/extraction/create-extractor';
import { FixtureMediaStore } from '@/lib/media/fixture-media-store';
import { DocumentIngestion } from '@/lib/services/document-ingestion';
import { DocumentProcessor } from '@/lib/services/ingestion/document-processor';
import { IntakeService } from '@/lib/services/ingestion/intake-service';
import { MatchStage } from '@/lib/services/ingestion/match-stage';
import { defaultMatchingConfig } from '@/lib/services/matching/matching-config';
import { matchDocument } from '@/lib/services/transaction-matcher';
import { RematchService } from '@/lib/services/transactions/rematch-service';
import { TransactionIngestionService } from '@/lib/services/transactions/transaction-ingestion';

import type { ContainerOverrides, Infrastructure } from './infrastructure';

/** The two ways work enters the system. Both share one MatchStage, so first matches and re-matches follow one rule set. */
export interface Pipelines {
  documents: DocumentIngestion;
  transactions: TransactionIngestionService;
}

export function buildPipelines(infra: Infrastructure, config: AppConfig, overrides: ContainerOverrides): Pipelines {
  const { repositories, unitOfWork, senders, scheduler, clock, logger } = infra;
  const dateRules = defaultMatchingConfig.date;
  const matchStage = new MatchStage({ repositories, unitOfWork, matchDocument, dateRules, clock });
  return {
    documents: buildDocumentIngestion(infra, config, overrides, matchStage),
    transactions: new TransactionIngestionService({
      transactions: repositories.transactions,
      rematch: new RematchService({ repositories, matchStage, senders, dateRules, logger }),
      scheduler,
      logger,
    }),
  };
}

/** Webhook → saved document (intake, before the response) → extracted and matched (processor, after it). */
function buildDocumentIngestion(
  { repositories, senders, blobStore, scheduler, logger }: Infrastructure,
  config: AppConfig,
  overrides: ContainerOverrides,
  matchStage: MatchStage,
): DocumentIngestion {
  const intake = new IntakeService({
    documents: repositories.documents,
    mediaStore: overrides.mediaStore ?? FixtureMediaStore.load(config.fixturesDir),
    blobStore,
    senders,
    logger,
    mediaTimeoutMs: config.mediaFetchTimeoutMs,
  });
  const processor = new DocumentProcessor({
    repositories,
    blobStore,
    extractor: overrides.extractor ?? createExtractor(config.extractor, config.fixturesDir, logger),
    senders,
    matchStage,
    logger,
  });
  return new DocumentIngestion({ intake, processor, scheduler, logger });
}

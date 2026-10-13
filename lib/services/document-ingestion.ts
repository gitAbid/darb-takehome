import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { InsertDocumentResult } from '@/lib/repositories/records';
import { adaptEmailPayload } from '@/lib/webhooks/email/email-adapter';
import type { AdaptedDelivery, IgnoreReason, PayloadIssue } from '@/lib/webhooks/inbound-message';
import { adaptWhatsAppPayload } from '@/lib/webhooks/whatsapp/whatsapp-adapter';

import type { BackgroundScheduler } from './ingestion/background-scheduler';
import type { DocumentProcessor } from './ingestion/document-processor';
import type { IntakeService } from './ingestion/intake-service';

export type MessageResult =
  | { externalId: string; result: 'created'; documentId: number }
  | { externalId: string; result: 'duplicate'; duplicateOf: 'externalId' | 'contentHash' }
  | { externalId: string | null; result: 'ignored'; reason: IgnoreReason };

export type WebhookOutcome =
  { kind: 'invalid'; issues: PayloadIssue[] } | { kind: 'accepted'; results: MessageResult[] };

export interface IngestionDependencies {
  intake: IntakeService;
  processor: DocumentProcessor;
  scheduler: BackgroundScheduler;
  logger: Logger;
}

/**
 * Webhook → Document pipeline (the brief's entry point). Synchronous part: validate, adapt, persist each message
 * exactly once, answer. Extraction and matching are scheduled to run after the response.
 */
export class DocumentIngestion {
  constructor(private readonly deps: IngestionDependencies) {}

  receiveEmail(payload: unknown): Promise<WebhookOutcome> {
    return this.receive('email', adaptEmailPayload(payload));
  }

  receiveWhatsApp(payload: unknown): Promise<WebhookOutcome> {
    return this.receive('whatsapp', adaptWhatsAppPayload(payload));
  }

  private async receive(channel: string, delivery: AdaptedDelivery): Promise<WebhookOutcome> {
    const logger = this.deps.logger.child({ channel });
    if (!delivery.ok) {
      logger.warn(LogEvents.WebhookRejected, { issues: delivery.issues.map((issue) => issue.path) });
      return { kind: 'invalid', issues: delivery.issues };
    }
    logger.info(LogEvents.WebhookReceived, { messages: delivery.messages.length, ignored: delivery.ignored.length });
    for (const ignored of delivery.ignored) logger.info(LogEvents.WebhookMessageIgnored, { ...ignored });
    const results: MessageResult[] = delivery.ignored.map((ignored) => ({ ...ignored, result: 'ignored' }));
    for (const message of delivery.messages) {
      results.push(toMessageResult(message.externalId, await this.deps.intake.intake(message)));
    }
    this.scheduleProcessing(results);
    return { kind: 'accepted', results };
  }

  private scheduleProcessing(results: readonly MessageResult[]): void {
    const created = results.flatMap((result) => (result.result === 'created' ? [result.documentId] : []));
    if (created.length === 0) return;
    this.deps.scheduler.schedule(async () => {
      for (const documentId of created) await this.deps.processor.process(documentId);
    });
  }
}

function toMessageResult(externalId: string, inserted: InsertDocumentResult): MessageResult {
  return inserted.kind === 'created'
    ? { externalId, result: 'created', documentId: inserted.id }
    : { externalId, result: 'duplicate', duplicateOf: inserted.field };
}

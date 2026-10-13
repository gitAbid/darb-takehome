import { contentHash } from '@/lib/domain/content-hash';
import { withTimeout } from '@/lib/domain/with-timeout';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { MediaStore } from '@/lib/media/media-store';
import type { DocumentRepository } from '@/lib/repositories/document-repository';
import type { InsertDocumentResult, NewDocument } from '@/lib/repositories/records';
import type { BlobStore } from '@/lib/storage/blob-store';
import type { InboundMessage } from '@/lib/webhooks/inbound-message';

import type { SenderResolver } from './sender-resolver';
import { senderOfMessage } from './sender-identity';

export interface IntakeDependencies {
  documents: DocumentRepository;
  mediaStore: MediaStore;
  blobStore: BlobStore;
  senders: SenderResolver;
  logger: Logger;
  mediaTimeoutMs: number;
}

type Content = { bytes: Buffer; mimeType: string } | { failure: 'MEDIA_UNAVAILABLE'; mimeType: string };

/**
 * Persists one inbound message as a Document, exactly once. Insert-first: the unique constraints on externalId and
 * contentHash decide duplicates, so two concurrent redeliveries cannot both create a row.
 */
export class IntakeService {
  constructor(private readonly deps: IntakeDependencies) {}

  async intake(message: InboundMessage): Promise<InsertDocumentResult> {
    const scope = await this.deps.senders.resolve(senderOfMessage(message));
    const content = await this.loadContent(message);
    if (!('failure' in content)) {
      this.deps.logger.debug(LogEvents.MediaLoaded, {
        externalId: message.externalId,
        origin: message.content.kind,
        mimeType: content.mimeType,
        bytes: content.bytes.length,
      });
    }
    const document = await this.buildDocument(message, content, scope?.clientIds);
    const result = await this.deps.documents.insert(document);
    this.logResult(message, result);
    return result;
  }

  private async loadContent(message: InboundMessage): Promise<Content> {
    const { content } = message;
    if (content.kind === 'inline') return { bytes: content.bytes, mimeType: content.mimeType };
    try {
      const media = await withTimeout(this.deps.mediaStore.fetch(content.mediaId), this.deps.mediaTimeoutMs);
      return { bytes: media.bytes, mimeType: media.mimeType };
    } catch (error) {
      this.deps.logger.warn(LogEvents.DocumentFailed, {
        externalId: message.externalId,
        stage: 'media',
        error: String(error),
      });
      return { failure: 'MEDIA_UNAVAILABLE', mimeType: content.mimeType };
    }
  }

  private async buildDocument(
    message: InboundMessage,
    content: Content,
    clientIds: readonly number[] | undefined,
  ): Promise<NewDocument> {
    const base = {
      source: message.source,
      externalId: message.externalId,
      senderIdentifier: message.sender,
      recipientIdentifier: message.recipient,
      clientId: clientIds?.length === 1 ? clientIds[0] : null,
      mimeType: content.mimeType,
    };
    if ('failure' in content) {
      return { ...base, contentHash: null, status: 'FAILED', failureReason: content.failure, storageKey: null };
    }
    const hash = contentHash(content.bytes);
    await this.deps.blobStore.put(hash, content.bytes);
    return { ...base, contentHash: hash, status: 'RECEIVED', failureReason: null, storageKey: hash };
  }

  private logResult(message: InboundMessage, result: InsertDocumentResult): void {
    const context = { externalId: message.externalId, source: message.source };
    if (result.kind === 'created')
      this.deps.logger.info(LogEvents.DocumentCreated, { ...context, documentId: result.id });
    else this.deps.logger.info(LogEvents.DocumentDuplicate, { ...context, duplicateOf: result.field });
  }
}

import type { DocumentRepository } from '@/lib/repositories/document-repository';
import type { BlobStore } from '@/lib/storage/blob-store';

export interface DocumentFile {
  bytes: Buffer;
  mimeType: string;
}

/** The original file a document was extracted from, so reviewers can see the receipt itself. */
export class DocumentFileService {
  constructor(
    private readonly documents: DocumentRepository,
    private readonly blobStore: BlobStore,
  ) {}

  async get(documentId: number): Promise<DocumentFile | null> {
    const document = await this.documents.findById(documentId);
    if (document?.storageKey == null) return null;
    try {
      return { bytes: await this.blobStore.get(document.storageKey), mimeType: document.mimeType };
    } catch {
      return null;
    }
  }
}

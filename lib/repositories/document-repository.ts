import type {
  DocumentStatusChange,
  InsertDocumentResult,
  NewDocument,
  StoredDocument,
  UnmatchedDocumentQuery,
} from './records';

export interface DocumentRepository {
  /** Insert-first idempotency: a unique violation on externalId or contentHash is reported, not thrown. */
  insert(document: NewDocument): Promise<InsertDocumentResult>;
  findById(id: number): Promise<StoredDocument | null>;
  /** Returns false when the document was no longer in `change.from` (someone else moved it). */
  changeStatus(change: DocumentStatusChange): Promise<boolean>;
  /** Matchable UNMATCHED documents of the client (or sent by the driver) dated within the range. */
  findUnmatchedNear(query: UnmatchedDocumentQuery): Promise<StoredDocument[]>;
}

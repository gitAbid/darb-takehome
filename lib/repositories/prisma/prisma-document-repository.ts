import type { DocumentRepository } from '../document-repository';
import type {
  DocumentStatusChange,
  InsertDocumentResult,
  NewDocument,
  StoredDocument,
  UnmatchedDocumentQuery,
} from '../records';
import { toDocumentCreateInput, toStatusChangeData, toStoredDocument } from './document-mapper';
import { uniqueViolationFields } from './map-prisma-error';
import type { PrismaDb } from './prisma-db';

const DEDUPE_FIELDS = ['externalId', 'contentHash'] as const;

type DedupeField = (typeof DEDUPE_FIELDS)[number];

export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly db: PrismaDb) {}

  async insert(document: NewDocument): Promise<InsertDocumentResult> {
    try {
      const { id } = await this.db.document.create({ data: toDocumentCreateInput(document), select: { id: true } });
      return { kind: 'created', id };
    } catch (error) {
      const field = duplicateField(error);
      if (field === null) throw error;
      return { kind: 'duplicate', field: await this.reportedDuplicateField(document, field) };
    }
  }

  async findUnmatchedNear(query: UnmatchedDocumentQuery): Promise<StoredDocument[]> {
    const rows = await this.db.document.findMany({
      where: {
        status: 'UNMATCHED',
        documentType: { in: ['RECEIPT', 'TAX_INVOICE'] },
        totalAmount: { not: null },
        documentDate: { gte: query.from, lte: query.to },
        OR: [
          { clientId: query.clientId },
          ...(query.driverPhone === null ? [] : [{ source: 'WHATSAPP' as const, senderIdentifier: query.driverPhone }]),
        ],
      },
      orderBy: { id: 'asc' },
    });
    return rows.map(toStoredDocument);
  }

  /**
   * A redelivery violates both unique constraints, but SQLite names only the first it checks. Report it as an
   * externalId duplicate (same message again) rather than a contentHash one (same file in a new message).
   */
  private async reportedDuplicateField(document: NewDocument, violated: DedupeField): Promise<DedupeField> {
    if (violated === 'externalId') return violated;
    const sameMessage = await this.db.document.findUnique({
      where: { externalId: document.externalId },
      select: { id: true },
    });
    return sameMessage ? 'externalId' : violated;
  }

  async findById(id: number): Promise<StoredDocument | null> {
    const row = await this.db.document.findUnique({ where: { id } });
    return row === null ? null : toStoredDocument(row);
  }

  async changeStatus(change: DocumentStatusChange): Promise<boolean> {
    const { count } = await this.db.document.updateMany({
      where: { id: change.id, status: change.from },
      data: toStatusChangeData(change),
    });
    return count === 1;
  }
}

function duplicateField(error: unknown): DedupeField | null {
  const fields = uniqueViolationFields(error) ?? [];
  return DEDUPE_FIELDS.find((field) => fields.includes(field)) ?? null;
}

import type { DocumentSource } from '@/lib/domain/statuses';

/** Where the document bytes are: inline in the payload (email) or behind a media id (WhatsApp). */
export type InboundContent =
  | { kind: 'inline'; bytes: Buffer; mimeType: string; filename: string }
  | { kind: 'media'; mediaId: string; mimeType: string };

/** One document-bearing message, independent of the channel it arrived on. */
export interface InboundMessage {
  source: DocumentSource;
  externalId: string;
  /** Email `from` (lower-cased) or WhatsApp phone (E.164). */
  sender: string;
  /** Email `to` (lower-cased); null for WhatsApp. */
  recipient: string | null;
  content: InboundContent;
}

export type IgnoreReason =
  'STATUS_ONLY' | 'UNSUPPORTED_TYPE' | 'INVALID_MESSAGE' | 'NOT_A_DOCUMENT' | 'SIGNATURE_IMAGE';

export interface IgnoredMessage {
  externalId: string | null;
  reason: IgnoreReason;
}

export interface PayloadIssue {
  path: string;
  message: string;
}

/** Result of adapting a webhook payload: a malformed envelope is rejected as a whole (→ 400). */
export type AdaptedDelivery =
  { ok: true; messages: InboundMessage[]; ignored: IgnoredMessage[] } | { ok: false; issues: PayloadIssue[] };

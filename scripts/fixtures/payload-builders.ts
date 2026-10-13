import { contentHash } from '../../lib/domain/content-hash';
import type { EmailPayload, WhatsAppImageMessage, WhatsAppPayload } from './payload-types';

export interface EmailInput {
  messageId: string;
  from: string;
  to: string;
  subject: string;
  receivedAt: string;
  attachments: readonly { filename: string; contentType: string; bytes: Uint8Array }[];
}

export interface WhatsAppImageInput {
  id: string;
  fromPhone: string;
  sentAt: string;
  mediaId: string;
  mimeType: string;
  bytes: Uint8Array;
}

export function buildEmailPayload(input: EmailInput): EmailPayload {
  return {
    messageId: input.messageId,
    from: input.from,
    to: input.to,
    subject: input.subject,
    receivedAt: input.receivedAt,
    attachments: input.attachments.map(({ filename, contentType, bytes }) => ({
      filename,
      contentType,
      contentBase64: Buffer.from(bytes).toString('base64'),
    })),
  };
}

/** Meta sends the sender as digits only and the time as Unix seconds. */
export function buildWhatsAppImageMessage(input: WhatsAppImageInput): WhatsAppImageMessage {
  return {
    id: input.id,
    from: input.fromPhone.replace(/\D/g, ''),
    timestamp: String(Math.floor(Date.parse(input.sentAt) / 1000)),
    type: 'image',
    image: { id: input.mediaId, mime_type: input.mimeType, sha256: contentHash(input.bytes) },
  };
}

export function buildWhatsAppPayload<M>(messages: readonly M[]): WhatsAppPayload<M> {
  return { entry: [{ changes: [{ value: { messages: [...messages] } }] }] };
}

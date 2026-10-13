import { attachmentIgnoreReason } from '../attachment-policy';
import type { AdaptedDelivery, IgnoredMessage, InboundMessage } from '../inbound-message';
import { toPayloadIssues } from '../payload-issues';
import { emailPayloadSchema, type EmailPayload } from './email-payload.schema';

/** Email payload → one InboundMessage per document attachment; logos and non-documents are reported as ignored. */
export function adaptEmailPayload(payload: unknown): AdaptedDelivery {
  const parsed = emailPayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, issues: toPayloadIssues(parsed.error) };
  const messages: InboundMessage[] = [];
  const ignored: IgnoredMessage[] = [];
  parsed.data.attachments.forEach((attachment, index) => {
    const externalId = `${parsed.data.messageId}:${index}`;
    const bytes = Buffer.from(attachment.contentBase64, 'base64');
    const reason = attachmentIgnoreReason({
      filename: attachment.filename,
      mimeType: attachment.contentType,
      size: bytes.length,
    });
    if (reason) ignored.push({ externalId, reason });
    else messages.push(toMessage(parsed.data, externalId, attachment.filename, attachment.contentType, bytes));
  });
  return { ok: true, messages, ignored };
}

function toMessage(
  payload: EmailPayload,
  externalId: string,
  filename: string,
  mimeType: string,
  bytes: Buffer,
): InboundMessage {
  return {
    source: 'EMAIL',
    externalId,
    sender: payload.from.trim().toLowerCase(),
    recipient: payload.to.trim().toLowerCase(),
    content: { kind: 'inline', bytes, mimeType: mimeType.trim().toLowerCase(), filename },
  };
}

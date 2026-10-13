import { toE164 } from '@/lib/domain/phone';

import type { AdaptedDelivery, IgnoredMessage, InboundMessage } from '../inbound-message';
import { toPayloadIssues } from '../payload-issues';
import { whatsAppEnvelopeSchema, whatsAppMessageSchema, type WhatsAppEnvelope } from './whatsapp-payload.schema';

/**
 * WhatsApp payload → one InboundMessage per image message. A malformed envelope is rejected; a bad message inside a
 * valid envelope is only skipped, because Meta re-sends the whole delivery on any non-2xx response.
 */
export function adaptWhatsAppPayload(payload: unknown): AdaptedDelivery {
  const parsed = whatsAppEnvelopeSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, issues: toPayloadIssues(parsed.error) };
  const messages: InboundMessage[] = [];
  const ignored: IgnoredMessage[] = [];
  for (const value of changeValues(parsed.data)) {
    if (!value.messages?.length) ignored.push({ externalId: null, reason: 'STATUS_ONLY' });
    for (const raw of value.messages ?? []) classify(raw, messages, ignored);
  }
  return { ok: true, messages, ignored };
}

function changeValues(envelope: WhatsAppEnvelope) {
  return envelope.entry.flatMap((entry) => entry.changes.map((change) => change.value));
}

function classify(raw: unknown, messages: InboundMessage[], ignored: IgnoredMessage[]): void {
  const parsed = whatsAppMessageSchema.safeParse(raw);
  const phone = parsed.success ? toE164(parsed.data.from) : null;
  if (!parsed.success || phone === null) {
    ignored.push({ externalId: parsed.success ? parsed.data.id : null, reason: 'INVALID_MESSAGE' });
    return;
  }
  const { id, type, image } = parsed.data;
  if (type !== 'image') ignored.push({ externalId: id, reason: 'UNSUPPORTED_TYPE' });
  else if (!image) ignored.push({ externalId: id, reason: 'INVALID_MESSAGE' });
  else
    messages.push({
      source: 'WHATSAPP',
      externalId: id,
      sender: phone,
      recipient: null,
      content: { kind: 'media', mediaId: image.id, mimeType: image.mime_type.trim().toLowerCase() },
    });
}

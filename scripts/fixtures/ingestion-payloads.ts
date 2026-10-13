import { buildWhatsAppImageMessage, buildWhatsAppPayload } from './payload-builders';

const D1_DIGITS = '966551234567';

/**
 * Payloads for the ingestion-only scenarios (docs/SCENARIOS.md §4).
 * `validImage` is S01's photo: in I06 the valid message dedupes against S01 by content hash if S01 was sent first.
 */
export function buildIngestionPayloads(validImage: Uint8Array): Record<string, unknown> {
  const emailWithoutAttachments = {
    messageId: 'msg_I01',
    from: 'fleet@najd-logistics.example',
    to: 'receipts+najd@darb.example.com',
    subject: 'Fwd: invoice',
    receivedAt: '2025-06-20T08:00:00Z',
  };
  const validMessage = buildWhatsAppImageMessage({
    id: 'wamid.I06-0001',
    fromPhone: D1_DIGITS,
    sentAt: '2025-06-20T09:00:00Z',
    mediaId: 'media_0101',
    mimeType: 'image/jpeg',
    bytes: validImage,
  });
  const imageWithoutId = { mime_type: validMessage.image.mime_type, sha256: validMessage.image.sha256 };
  return {
    'i01-email-missing-attachments.json': emailWithoutAttachments,
    'i02-whatsapp-entry-not-array.json': { entry: { changes: [] } },
    'i03-whatsapp-status-only.json': {
      entry: [
        {
          changes: [{ value: { statuses: [{ id: 'wamid.S01-0001', status: 'delivered', timestamp: '1749541900' }] } }],
        },
      ],
    },
    'i04-whatsapp-text-message.json': buildWhatsAppPayload([
      {
        id: 'wamid.I04-0001',
        from: D1_DIGITS,
        timestamp: '1750410000',
        type: 'text',
        text: { body: 'receipt coming' },
      },
    ]),
    'i05-whatsapp-unknown-media.json': buildWhatsAppPayload([
      { ...validMessage, id: 'wamid.I05-0001', image: { ...validMessage.image, id: 'media_9999' } },
    ]),
    'i06-whatsapp-one-invalid-message.json': buildWhatsAppPayload([
      validMessage,
      { ...validMessage, id: 'wamid.I06-0002', image: imageWithoutId },
    ]),
  };
}

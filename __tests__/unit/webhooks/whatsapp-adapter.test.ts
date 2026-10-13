import { adaptWhatsAppPayload } from '@/lib/webhooks/whatsapp/whatsapp-adapter';

const delivery = (...messages: unknown[]) => ({ entry: [{ changes: [{ value: { messages } }] }] });
const image = (id: string, from = '966551234567') => ({
  id,
  from,
  timestamp: '1749541800',
  type: 'image',
  image: { id: `media-${id}`, mime_type: 'Image/JPEG', sha256: 'x' },
});

describe('WhatsApp adapter', () => {
  it('adapts image messages (E.164 sender) and skips everything else without rejecting the delivery (D7)', () => {
    const result = adaptWhatsAppPayload({
      entry: [
        { changes: [{ value: { statuses: [{ id: 's' }] } }] },
        {
          changes: [
            {
              value: {
                messages: [
                  image('wamid.1'),
                  { ...image('wamid.2'), type: 'text', image: undefined },
                  { ...image('wamid.3'), image: undefined },
                  { ...image('wamid.4'), from: 'not-a-phone' },
                  { id: '' },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      ok: true,
      messages: [
        {
          source: 'WHATSAPP',
          externalId: 'wamid.1',
          sender: '+966551234567',
          recipient: null,
          content: { kind: 'media', mediaId: 'media-wamid.1', mimeType: 'image/jpeg' },
        },
      ],
      ignored: [
        { externalId: null, reason: 'STATUS_ONLY' },
        { externalId: 'wamid.2', reason: 'UNSUPPORTED_TYPE' },
        { externalId: 'wamid.3', reason: 'INVALID_MESSAGE' },
        { externalId: 'wamid.4', reason: 'INVALID_MESSAGE' },
        { externalId: null, reason: 'INVALID_MESSAGE' },
      ],
    });
  });

  it('rejects a malformed envelope', () => {
    expect(adaptWhatsAppPayload({ entry: [{ changes: 'x' }] })).toEqual({
      ok: false,
      issues: [{ path: 'entry.0.changes', message: expect.any(String) }],
    });
    expect(adaptWhatsAppPayload(delivery(image('wamid.1'))).ok).toBe(true);
  });
});

import { attachmentIgnoreReason } from '@/lib/webhooks/attachment-policy';
import { adaptEmailPayload } from '@/lib/webhooks/email/email-adapter';

const base64 = (size: number) => Buffer.alloc(size, 1).toString('base64');
const payload = (attachments: object[]) => ({
  messageId: 'msg_1',
  from: 'Fleet@Najd-Logistics.example',
  to: 'Receipts+Najd@darb.example.com',
  subject: 'Tax Invoice',
  receivedAt: '2025-06-14T09:21:00Z',
  attachments,
});

describe('email adapter', () => {
  it('turns each document attachment into a message keyed messageId:index, with normalized addresses', () => {
    const delivery = adaptEmailPayload(
      payload([
        { filename: 'logo.png', contentType: 'image/png', contentBase64: base64(1_000) },
        { filename: 'invoice.pdf', contentType: 'application/pdf', contentBase64: base64(1_500) },
      ]),
    );
    expect(delivery).toEqual({
      ok: true,
      ignored: [{ externalId: 'msg_1:0', reason: 'SIGNATURE_IMAGE' }],
      messages: [
        {
          source: 'EMAIL',
          externalId: 'msg_1:1',
          sender: 'fleet@najd-logistics.example',
          recipient: 'receipts+najd@darb.example.com',
          content: {
            kind: 'inline',
            bytes: Buffer.alloc(1_500, 1),
            mimeType: 'application/pdf',
            filename: 'invoice.pdf',
          },
        },
      ],
    });
  });

  it('rejects a malformed envelope with every offending path', () => {
    const delivery = adaptEmailPayload({
      ...payload([{ filename: 'a.pdf', contentType: 'application/pdf', contentBase64: '%%%' }]),
      from: 'nope',
    });
    expect(delivery.ok ? [] : delivery.issues.map((issue) => issue.path)).toEqual([
      'from',
      'attachments.0.contentBase64',
    ]);
  });

  it('keeps PDFs of any size, drops small or logo-named images and non-documents', () => {
    const cases = [
      { filename: 'invoice.pdf', mimeType: 'application/pdf', size: 900 },
      { filename: 'receipt.jpg', mimeType: 'image/jpeg', size: 90_000 },
      { filename: 'tiny.jpg', mimeType: 'image/jpeg', size: 4_000 },
      { filename: 'company-logo.png', mimeType: 'image/png', size: 40_000 },
      { filename: 'notes.txt', mimeType: 'text/plain', size: 900 },
      { filename: 'empty.pdf', mimeType: 'application/pdf', size: 0 },
    ];
    expect(cases.map(attachmentIgnoreReason)).toEqual([
      null,
      null,
      'SIGNATURE_IMAGE',
      'SIGNATURE_IMAGE',
      'NOT_A_DOCUMENT',
      'NOT_A_DOCUMENT',
    ]);
  });
});

import { readFileSync } from 'node:fs';

import { contentHash } from '@/lib/domain/content-hash';
import { readScenarioDocument } from '@/scripts/fixtures/document-reader';
import { assemblePayloadFiles, buildMediaMap } from '@/scripts/fixtures/payload-assembler';
import {
  buildEmailPayload,
  buildWhatsAppImageMessage,
  buildWhatsAppPayload,
} from '@/scripts/fixtures/payload-builders';
import { SCENARIO_PAYLOAD_SPECS } from '@/scripts/fixtures/payload-specs';
import type { EmailPayload, WhatsAppPayload } from '@/scripts/fixtures/payload-types';
import { LOGO_FILE } from '@/scripts/fixtures/paths';

const readDocument = (folder: string) => readScenarioDocument(folder);
const logo = readFileSync(LOGO_FILE);
const files = assemblePayloadFiles(SCENARIO_PAYLOAD_SPECS, readDocument, logo);
const payload = <T>(path: string): T => files.find((file) => file.path === path)!.content as T;
const decode = (base64: string) => contentHash(Buffer.from(base64, 'base64'));

describe('payload builders', () => {
  it('base64-encodes email attachments losslessly', () => {
    const bytes = Buffer.from([0, 1, 2, 250, 255]);
    const email = buildEmailPayload({
      messageId: 'm',
      from: 'a@x',
      to: 'b@x',
      subject: 's',
      receivedAt: '2025-06-01T00:00:00Z',
      attachments: [{ filename: 'f.pdf', contentType: 'application/pdf', bytes }],
    });
    expect(Buffer.from(email.attachments[0].contentBase64, 'base64')).toEqual(bytes);
  });

  it('builds a WhatsApp image message the way Meta sends it', () => {
    const message = buildWhatsAppImageMessage({
      id: 'wamid.1',
      fromPhone: '+966 55 123 4567',
      sentAt: '2025-06-10T07:50:00Z',
      mediaId: 'media_1',
      mimeType: 'image/jpeg',
      bytes: Buffer.from('photo'),
    });
    expect(message).toEqual({
      id: 'wamid.1',
      from: '966551234567',
      timestamp: '1749541800',
      type: 'image',
      image: { id: 'media_1', mime_type: 'image/jpeg', sha256: contentHash(Buffer.from('photo')) },
    });
    expect(buildWhatsAppPayload([message]).entry[0].changes[0].value.messages).toEqual([message]);
  });
});

describe('scenario payloads', () => {
  it('writes one payload per scenario, the media map and six ingestion payloads', () => {
    expect(files.filter((file) => file.path.startsWith('scenarios/'))).toHaveLength(SCENARIO_PAYLOAD_SPECS.length);
    expect(files.filter((file) => file.path.startsWith('payloads/ingestion/'))).toHaveLength(6);
    expect(files.some((file) => file.path === 'media-map.json')).toBe(true);
  });

  it('carries the exact bytes of each emailed document', () => {
    for (const spec of SCENARIO_PAYLOAD_SPECS.filter((s) => s.channel === 'email')) {
      const email = payload<EmailPayload>(`scenarios/${spec.folder}/payload.json`);
      expect(decode(email.attachments[0].contentBase64)).toBe(contentHash(readDocument(spec.folder).bytes));
    }
  });

  it('puts the hash of the referenced photo in each WhatsApp message, with the sender as digits', () => {
    for (const spec of SCENARIO_PAYLOAD_SPECS.filter((s) => s.channel === 'whatsapp')) {
      const [message] = payload<WhatsAppPayload>(`scenarios/${spec.folder}/payload.json`).entry[0].changes[0].value
        .messages;
      expect(message.image.sha256).toBe(contentHash(readDocument(spec.documentFolder).bytes));
      expect(message.from).toMatch(/^9665\d{8}$/);
    }
  });

  it('reproduces the brief’s example email literally for S11', () => {
    expect(payload<EmailPayload>('scenarios/11-unknown-sender/payload.json')).toMatchObject({
      messageId: 'msg_8f2a1',
      from: 'billing@alfanar-fuel.com.sa',
      to: 'receipts@darb.example.com',
      subject: 'Tax Invoice #INV-99812',
      receivedAt: '2025-06-14T09:21:00Z',
      attachments: [{ filename: 'invoice-99812.pdf', contentType: 'application/pdf' }],
    });
  });

  it('adds the signature logo only to S02, using the extension of the real document', () => {
    const s02 = payload<EmailPayload>('scenarios/02-ambiguous-same-chain/payload.json');
    expect(s02.attachments.map((a) => [a.filename, a.contentType])).toEqual([
      ['invoice-99830.pdf', 'application/pdf'],
      ['logo.png', 'image/png'],
    ]);
    expect(payload<EmailPayload>('scenarios/08-shared-last4/payload.json').attachments[0].filename).toBe(
      'lamaa-receipt.jpg',
    );
  });

  it('S04 resends S01’s photo under a new message id and media id', () => {
    const [s01] = payload<WhatsAppPayload>('scenarios/01-exact-match/payload.json').entry[0].changes[0].value.messages;
    const [s04] = payload<WhatsAppPayload>('scenarios/04-duplicate-photo/payload.json').entry[0].changes[0].value
      .messages;
    expect(s04.image.sha256).toBe(s01.image.sha256);
    expect([s04.id, s04.image.id]).toEqual(['wamid.S04-0002', 'media_0102']);
  });

  it('is deterministic', () => {
    expect(assemblePayloadFiles(SCENARIO_PAYLOAD_SPECS, readDocument, logo)).toEqual(files);
  });
});

describe('media map', () => {
  it('maps every WhatsApp media id to its document, with media_0102 resending S01', () => {
    const map = buildMediaMap(SCENARIO_PAYLOAD_SPECS, readDocument);
    expect(Object.keys(map)).toEqual([
      'media_0101',
      'media_0102',
      'media_0301',
      'media_0601',
      'media_0901',
      'media_1201',
      'media_1301',
    ]);
    expect(map.media_0102).toEqual(map.media_0101);
    expect(map.media_0101).toEqual({ file: 'scenarios/01-exact-match/document.jpg', mimeType: 'image/jpeg' });
  });
});

describe('ingestion payloads', () => {
  const ingestion = (name: string) => payload<Record<string, unknown>>(`payloads/ingestion/${name}`);

  it('I01 has no attachments; I02 has a non-array entry; I03 has statuses only', () => {
    expect(ingestion('i01-email-missing-attachments.json')).not.toHaveProperty('attachments');
    expect(Array.isArray(ingestion('i02-whatsapp-entry-not-array.json').entry)).toBe(false);
    expect(JSON.stringify(ingestion('i03-whatsapp-status-only.json'))).not.toContain('messages');
  });

  it('I05 points at an unknown media id; I06 has one valid and one id-less image message', () => {
    expect(JSON.stringify(ingestion('i05-whatsapp-unknown-media.json'))).toContain('media_9999');
    const messages = (ingestion('i06-whatsapp-one-invalid-message.json') as unknown as WhatsAppPayload).entry[0]
      .changes[0].value.messages;
    expect(messages[0].image.id).toBe('media_0101');
    expect(messages[1].image).not.toHaveProperty('id');
  });
});

/**
 * End-to-end: real webhook handlers → adapters → intake → extraction → matching → database, driven by the committed
 * scenario payloads (docs/SCENARIOS.md §3–§4). Each row asserts what a reviewer or auditor would see.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { createTestApp, documentOutcome, FIXTURES_DIR, readFixtureJson, resetAndSeed } from '../helpers/e2e-app';
import { db } from '../helpers/test-database';

type Channel = 'email' | 'whatsapp';

const SCENARIOS: [string, Channel, string, unknown][] = [
  [
    '01-exact-match',
    'whatsapp',
    'wamid.S01-0001',
    {
      status: 'MATCHED',
      reasons: ['ALL_GATES_PASSED'],
      matches: [
        ['T01', 'AUTO_CONFIRMED', 1],
        ['T03', 'REJECTED', 0.88],
      ],
    },
  ],
  [
    '02-ambiguous-same-chain',
    'email',
    'msg_S02:0',
    {
      status: 'NEEDS_REVIEW',
      reasons: ['NEAR_TIE'],
      matches: [
        ['T04', 'CANDIDATE', 1],
        ['T05', 'CANDIDATE', 1],
      ],
    },
  ],
  [
    '03-restaurant-tip',
    'whatsapp',
    'wamid.S03-0001',
    { status: 'NEEDS_REVIEW', reasons: ['AMOUNT_TIP_TOLERANCE'], matches: [['T06', 'CANDIDATE', 0.88]] },
  ],
  ['05-invoice-no-transaction', 'email', 'msg_S05:0', { status: 'UNMATCHED', reasons: ['NO_CANDIDATES'], matches: [] }],
  [
    '06-garbage-extraction',
    'whatsapp',
    'wamid.S06-0001',
    { status: 'UNMATCHED', reasons: ['NOT_MATCHABLE'], matches: [] },
  ],
  [
    '07-invoice-after-confirmed-receipt',
    'email',
    'msg_S07:0',
    { status: 'NEEDS_REVIEW', reasons: ['TXN_ALREADY_HAS_DOCUMENT'], matches: [['T07', 'CANDIDATE', 1]] },
  ],
  [
    '08-shared-last4',
    'email',
    'msg_S08:0',
    {
      status: 'NEEDS_REVIEW',
      reasons: ['NEAR_TIE'],
      matches: [
        ['T08', 'CANDIDATE', 1],
        ['T09', 'CANDIDATE', 1],
      ],
    },
  ],
  [
    '09-card-misread',
    'whatsapp',
    'wamid.S09-0001',
    { status: 'NEEDS_REVIEW', reasons: ['CARD_POSSIBLE_MISREAD'], matches: [['T10', 'CANDIDATE', 0.86]] },
  ],
  ['10-extractor-error', 'email', 'msg_S10:0', { status: 'FAILED', failureReason: 'EXTRACTION_ERROR', matches: [] }],
  ['11-unknown-sender', 'email', 'msg_8f2a1:0', { status: 'UNMATCHED', reasons: ['UNKNOWN_SENDER'], matches: [] }],
  [
    '12-back-to-back-refuel',
    'whatsapp',
    'wamid.S12-0001',
    {
      status: 'NEEDS_REVIEW',
      reasons: ['NEAR_TIE'],
      matches: [
        ['T11', 'CANDIDATE', 1],
        ['T12', 'CANDIDATE', 0.95],
      ],
    },
  ],
  [
    '13-foreign-currency',
    'whatsapp',
    'wamid.S13-0001',
    { status: 'UNMATCHED', reasons: ['NO_CANDIDATES'], matches: [] },
  ],
];

const payload = (folder: string) => readFixtureJson('scenarios', folder, 'payload.json');
const ingestion = (name: string) => readFixtureJson('payloads', 'ingestion', `${name}.json`);

beforeEach(resetAndSeed);
afterAll(() => db.$disconnect());

describe('webhook scenarios (docs/SCENARIOS.md §3)', () => {
  it.each(SCENARIOS)('%s → %j', async (folder, channel, externalId, expected) => {
    const app = createTestApp();
    const response = await app.post(channel, payload(folder));
    expect(response.status).toBe(200);
    expect(await documentOutcome(externalId)).toMatchObject(expected as object);
  });
});

describe('idempotency and delivery behaviour (docs/SCENARIOS.md §4)', () => {
  it('S04: a redelivery and a resend of the same photo never create a second document', async () => {
    const app = createTestApp();
    await app.post('whatsapp', payload('01-exact-match'));
    const redelivery = await app.post('whatsapp', payload('01-exact-match'));
    const resend = await app.post('whatsapp', payload('04-duplicate-photo'));
    expect(redelivery.body.results).toEqual([
      { externalId: 'wamid.S01-0001', result: 'duplicate', duplicateOf: 'externalId' },
    ]);
    expect(resend.body.results).toEqual([
      { externalId: 'wamid.S04-0002', result: 'duplicate', duplicateOf: 'contentHash' },
    ]);
    expect(
      await db.document.count({ where: { source: 'WHATSAPP', NOT: { externalId: { startsWith: 'wamid.seed' } } } }),
    ).toBe(1);
  });

  it('I09: concurrent deliveries of the same message create exactly one document', async () => {
    const app = createTestApp();
    const responses = await Promise.all([1, 2, 3].map(() => app.post('email', payload('05-invoice-no-transaction'))));
    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(await db.document.count({ where: { externalId: 'msg_S05:0' } })).toBe(1);
  });

  it.each([
    ['I01 email without attachments', 'email', ingestion('i01-email-missing-attachments'), 'attachments'],
    ['I02 WhatsApp entry not an array', 'whatsapp', ingestion('i02-whatsapp-entry-not-array'), 'entry'],
    ['body that is not JSON', 'email', '{not json', '(root)'],
  ] as [string, Channel, unknown, string][])(
    '%s → 400 with the offending path, nothing stored',
    async (_label, channel, body, path) => {
      const response = await createTestApp().post(channel, body);
      expect(response.status).toBe(400);
      expect(response.body.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path })]));
      expect(await db.document.count()).toBe(1);
    },
  );

  it('I03/I04/I06: status-only, text and invalid messages are acknowledged and skipped; valid siblings proceed', async () => {
    const app = createTestApp();
    expect((await app.post('whatsapp', ingestion('i03-whatsapp-status-only'))).body.results).toEqual([
      { externalId: null, result: 'ignored', reason: 'STATUS_ONLY' },
    ]);
    expect((await app.post('whatsapp', ingestion('i04-whatsapp-text-message'))).body.results).toMatchObject([
      { result: 'ignored', reason: 'UNSUPPORTED_TYPE' },
    ]);
    const mixed = await app.post('whatsapp', ingestion('i06-whatsapp-one-invalid-message'));
    expect(mixed.status).toBe(200);
    expect(mixed.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ result: 'ignored', reason: 'INVALID_MESSAGE' }),
        expect.objectContaining({ result: 'created' }),
      ]),
    );
  });

  it('I05: unavailable WhatsApp media is stored as FAILED (MEDIA_UNAVAILABLE), never lost', async () => {
    const response = await createTestApp().post('whatsapp', ingestion('i05-whatsapp-unknown-media'));
    expect(response.status).toBe(200);
    const failed = await db.document.findFirstOrThrow({ where: { failureReason: 'MEDIA_UNAVAILABLE' } });
    expect(failed).toMatchObject({ status: 'FAILED', contentHash: null });
  });

  it('I07/I08: the signature logo is ignored and every real attachment becomes its own document', async () => {
    const pdf = readFileSync(join(FIXTURES_DIR, 'scenarios', '05-invoice-no-transaction', 'document.pdf'));
    const jpg = readFileSync(join(FIXTURES_DIR, 'scenarios', '08-shared-last4', 'document.jpg'));
    const logo = readFileSync(join(FIXTURES_DIR, 'assets', 'logo.png'));
    const attachment = (filename: string, contentType: string, bytes: Buffer) => ({
      filename,
      contentType,
      contentBase64: bytes.toString('base64'),
    });
    const response = await createTestApp().post('email', {
      ...(payload('05-invoice-no-transaction') as object),
      messageId: 'msg_multi',
      attachments: [
        attachment('logo.png', 'image/png', logo),
        attachment('inv.pdf', 'application/pdf', pdf),
        attachment('r.jpg', 'image/jpeg', jpg),
      ],
    });
    expect(response.body.results).toEqual([
      { externalId: 'msg_multi:0', result: 'ignored', reason: 'SIGNATURE_IMAGE' },
      expect.objectContaining({ externalId: 'msg_multi:1', result: 'created' }),
      expect.objectContaining({ externalId: 'msg_multi:2', result: 'created' }),
    ]);
    expect((await documentOutcome('msg_multi:2')).status).toBe('NEEDS_REVIEW');
  });

  it('I10: when nothing can be persisted the webhook answers 500 so the provider retries', async () => {
    const unreachable = new PrismaClient({ datasources: { db: { url: 'file:/nonexistent-dir/none.db' } } });
    const app = createTestApp({ db: unreachable });
    const response = await app.post('email', payload('05-invoice-no-transaction'));
    expect(response).toEqual({ status: 500, body: { error: 'INTERNAL' } });
    expect(app.logger.entries.some((entry) => entry.level === 'error')).toBe(true);
    await unreachable.$disconnect();
  });
});

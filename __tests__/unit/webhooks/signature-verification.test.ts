import { createHmac } from 'node:crypto';

import { loadAppConfig } from '@/lib/config/app-config';
import { RecordingLogger } from '@/lib/logging/recording-logger';
import { createWebhookVerifiers } from '@/lib/webhooks/security/create-verifiers';
import { HmacSha256SignatureVerifier } from '@/lib/webhooks/security/hmac-signature-verifier';
import { UnsignedRequestsAccepted, type SignatureCheck } from '@/lib/webhooks/security/signature-verifier';
import { createWhatsAppVerificationHandler } from '@/lib/webhooks/whatsapp/verification-handshake';

const SECRET = 'app-secret';
const BODY = Buffer.from('{"entry":[]}');
const sign = (body: Buffer | string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('HMAC-SHA256 signature verifier', () => {
  const verifier = new HmacSha256SignatureVerifier(SECRET, 'x-hub-signature-256');
  const check = (header: string | null, body: Buffer = BODY) =>
    verifier.verify(body, new Headers(header === null ? {} : { 'x-hub-signature-256': header }));

  it('accepts only the exact raw body signed with our secret', () => {
    const cases: [string, string | null, Buffer, SignatureCheck][] = [
      ['the exact raw body signed with our secret', sign(BODY), BODY, { ok: true }],
      [
        'upper-case hex with surrounding spaces',
        ` ${sign(BODY).toUpperCase().replace('SHA256=', 'sha256=')} `,
        BODY,
        { ok: true },
      ],
      ['no header', null, BODY, { ok: false, reason: 'MISSING_SIGNATURE' }],
      ['an empty header', '', BODY, { ok: false, reason: 'MISSING_SIGNATURE' }],
      [
        'a body re-serialized with different whitespace',
        sign('{"entry": []}'),
        BODY,
        { ok: false, reason: 'INVALID_SIGNATURE' },
      ],
      ['another secret', sign(BODY, 'other-secret'), BODY, { ok: false, reason: 'INVALID_SIGNATURE' }],
      [
        'a bare hex digest without the sha256= prefix',
        sign(BODY).slice(7),
        BODY,
        { ok: false, reason: 'INVALID_SIGNATURE' },
      ],
      [
        'a truncated signature (length mismatch)',
        sign(BODY).slice(0, -2),
        BODY,
        { ok: false, reason: 'INVALID_SIGNATURE' },
      ],
    ];
    for (const [name, header, body, expected] of cases) expect([name, check(header, body)]).toEqual([name, expected]);
  });
});

describe('verifier selection', () => {
  it('uses HMAC only where a secret is configured, and warns for every endpoint left unsigned', () => {
    const logger = new RecordingLogger();
    const config = loadAppConfig({ LOG_SINK: 'test', WHATSAPP_APP_SECRET: SECRET }).webhookSecurity;
    const verifiers = createWebhookVerifiers(config, logger);
    expect(verifiers.whatsapp).toBeInstanceOf(HmacSha256SignatureVerifier);
    expect(verifiers.email).toBeInstanceOf(UnsignedRequestsAccepted);
    expect(verifiers.email.verify(BODY, new Headers())).toEqual({ ok: true });
    expect(logger.entries.map((entry) => [entry.event, entry.context?.channel])).toEqual([
      ['webhook.signature_disabled', 'email'],
      ['webhook.signature_disabled', 'transactions'],
    ]);
  });
});

describe('WhatsApp subscription handshake', () => {
  const handshake = (token: string | null, query: string) =>
    createWhatsAppVerificationHandler(
      token,
      new RecordingLogger(),
    )(new Request(`http://test/api/webhooks/whatsapp?${query}`));

  it('echoes the challenge as plain text only for subscribe + our token', async () => {
    const response = await handshake(
      'verify-me',
      'hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1158201444',
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/plain');
    expect(await response.text()).toBe('1158201444');
  });

  it('refuses everything else with 403', async () => {
    const cases: [string, string | null, string][] = [
      ['a wrong token', 'verify-me', 'hub.mode=subscribe&hub.verify_token=guess&hub.challenge=1'],
      ['another mode', 'verify-me', 'hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1'],
      ['no challenge', 'verify-me', 'hub.mode=subscribe&hub.verify_token=verify-me'],
      ['no token configured', null, 'hub.mode=subscribe&hub.verify_token=&hub.challenge=1'],
    ];
    for (const [name, token, query] of cases)
      expect([name, (await handshake(token, query)).status]).toEqual([name, 403]);
  });
});

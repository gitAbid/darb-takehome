import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { constantTimeEqual } from '@/lib/webhooks/security/constant-time';

import type { WebhookHandler } from '../http/webhook-handler';

/**
 * Meta's subscription handshake: GET ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… must echo the challenge
 * when the token is ours. Without a configured token nothing can be verified, so every attempt is refused.
 */
export function createWhatsAppVerificationHandler(verifyToken: string | null, logger: Logger): WebhookHandler {
  return async (request) => {
    const params = new URL(request.url).searchParams;
    const challenge = params.get('hub.challenge');
    const tokenMatches = verifyToken !== null && constantTimeEqual(params.get('hub.verify_token') ?? '', verifyToken);
    if (params.get('hub.mode') === 'subscribe' && challenge && tokenMatches) {
      return new Response(challenge, {
        status: 200,
        headers: { 'content-type': 'text/plain', 'x-content-type-options': 'nosniff' },
      });
    }
    logger.warn(LogEvents.WebhookUnauthorized, { channel: 'whatsapp', reason: 'VERIFY_TOKEN_MISMATCH' });
    return new Response('Forbidden', { status: 403 });
  };
}

import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { SignatureVerifier } from '@/lib/webhooks/security/signature-verifier';

/**
 * The request body as JSON, or the response that ends the request: 401 when the signature does not verify, 400 when
 * the body is not JSON. Authentication comes first, so an unauthenticated body is never parsed.
 */
export async function readSignedJson(
  request: Request,
  verifier: SignatureVerifier,
  logger: Logger,
): Promise<{ payload: unknown } | { response: Response }> {
  const rawBody = Buffer.from(await request.arrayBuffer());
  const check = verifier.verify(rawBody, request.headers);
  if (!check.ok) {
    logger.warn(LogEvents.WebhookUnauthorized, { path: new URL(request.url).pathname, reason: check.reason });
    return { response: Response.json({ error: check.reason }, { status: 401 }) };
  }
  try {
    return { payload: JSON.parse(rawBody.toString('utf8')) as unknown };
  } catch {
    return {
      response: Response.json(
        { error: 'INVALID_JSON', issues: [{ path: '(root)', message: 'Body is not JSON' }] },
        { status: 400 },
      ),
    };
  }
}

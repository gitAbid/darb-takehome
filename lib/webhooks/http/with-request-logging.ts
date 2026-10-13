import { randomUUID } from 'node:crypto';

import { runWithLogContext } from '@/lib/logging/log-context';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';

import type { WebhookHandler } from './webhook-handler';

export const CORRELATION_HEADER = 'x-correlation-id';

/**
 * Decorator for every inbound endpoint: gives the request a correlationId that every log event of the request — and
 * of the processing it schedules after the response — carries, logs one `http.request` line with status and duration,
 * and returns the id in a response header so a provider-side failure can be traced to our logs.
 */
export function withRequestLogging(
  handler: WebhookHandler,
  logger: Logger,
  newCorrelationId: () => string = randomUUID,
): WebhookHandler {
  return (request) => {
    const correlationId = newCorrelationId();
    return runWithLogContext({ correlationId }, async () => {
      const started = performance.now();
      const response = await handler(request);
      logger.info(LogEvents.HttpRequest, {
        method: request.method,
        path: new URL(request.url).pathname,
        status: response.status,
        durationMs: Math.round(performance.now() - started),
      });
      response.headers.set(CORRELATION_HEADER, correlationId);
      return response;
    });
  };
}

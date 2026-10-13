import type { WebhookSecurityConfig } from '@/lib/config/app-config';
import type { Logger } from '@/lib/logging/logger';
import { createTransactionHandler } from '@/lib/webhooks/http/transaction-handler';
import { createWebhookHandler, type WebhookHandler } from '@/lib/webhooks/http/webhook-handler';
import { withRequestLogging } from '@/lib/webhooks/http/with-request-logging';
import { createWebhookVerifiers } from '@/lib/webhooks/security/create-verifiers';
import { createWhatsAppVerificationHandler } from '@/lib/webhooks/whatsapp/verification-handshake';

import type { Pipelines } from './pipelines';

/** One handler per inbound endpoint: signature check → pipeline, each wrapped with request logging. */
export interface HttpHandlers {
  webhooks: { email: WebhookHandler; whatsapp: WebhookHandler; whatsappVerification: WebhookHandler };
  transactions: WebhookHandler;
}

export function buildHttpHandlers(pipelines: Pipelines, security: WebhookSecurityConfig, logger: Logger): HttpHandlers {
  const { documents, transactions } = pipelines;
  const verifiers = createWebhookVerifiers(security, logger);
  const logged = (handler: WebhookHandler) => withRequestLogging(handler, logger);
  return {
    webhooks: {
      email: logged(createWebhookHandler((payload) => documents.receiveEmail(payload), verifiers.email, logger)),
      whatsapp: logged(
        createWebhookHandler((payload) => documents.receiveWhatsApp(payload), verifiers.whatsapp, logger),
      ),
      whatsappVerification: logged(createWhatsAppVerificationHandler(security.whatsappVerifyToken, logger)),
    },
    transactions: logged(
      createTransactionHandler((payload) => transactions.receive(payload), verifiers.transactions, logger),
    ),
  };
}

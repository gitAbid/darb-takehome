import { getContainer } from '@/lib/container';

/** Inbound WhatsApp webhook — HTTP only; the pipeline lives in lib/services/document-ingestion.ts. */
export function POST(request: Request): Promise<Response> {
  return getContainer().webhooks.whatsapp(request);
}

/** Meta's subscription handshake (echoes hub.challenge when hub.verify_token is ours). */
export function GET(request: Request): Promise<Response> {
  return getContainer().webhooks.whatsappVerification(request);
}

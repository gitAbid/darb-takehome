import { getContainer } from '@/lib/container';

/** Inbound WhatsApp webhook — HTTP only; the pipeline lives in lib/services/document-ingestion.ts. */
export function POST(request: Request): Promise<Response> {
  return getContainer().webhooks.whatsapp(request);
}

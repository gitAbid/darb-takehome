import { z } from 'zod';

/** Envelope of the simplified Meta Cloud API payload. Messages are validated one by one (see the adapter). */
export const whatsAppEnvelopeSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({ messages: z.array(z.unknown()).optional() }).passthrough(),
        }),
      ),
    }),
  ),
});

export const whatsAppMessageSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.string().min(1),
  image: z.object({ id: z.string().min(1), mime_type: z.string().min(1), sha256: z.string().optional() }).optional(),
});

export type WhatsAppEnvelope = z.infer<typeof whatsAppEnvelopeSchema>;
export type WhatsAppMessage = z.infer<typeof whatsAppMessageSchema>;

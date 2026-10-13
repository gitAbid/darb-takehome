import { z } from 'zod';

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

export const emailAttachmentSchema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentBase64: z
    .string()
    .transform((value) => value.replace(/\s/g, ''))
    .refine((value) => BASE64.test(value), 'must be base64'),
});

/** Simplified inbound-parse payload from the brief. */
export const emailPayloadSchema = z.object({
  messageId: z.string().min(1),
  from: z.string().email(),
  to: z.string().email(),
  subject: z.string().default(''),
  receivedAt: z.string().datetime({ offset: true }),
  attachments: z.array(emailAttachmentSchema),
});

export type EmailPayload = z.infer<typeof emailPayloadSchema>;

import { z } from 'zod';

import { toE164 } from '@/lib/domain/phone';

/** A settled card transaction from the card feed (E4: final settled amounts). */
export const transactionPayloadSchema = z.object({
  externalRef: z.string().min(1),
  clientId: z.number().int().positive(),
  cardId: z.number().int().positive(),
  driverPhone: z
    .string()
    .nullish()
    .transform((value, context) => {
      if (value === null || value === undefined) return null;
      const phone = toE164(value);
      if (phone === null) context.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a phone number' });
      return phone;
    }),
  merchantName: z.string().trim().min(1),
  mcc: z.string().regex(/^\d{4}$/, 'must be a 4-digit merchant category code'),
  amount: z.number().int().positive(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/, 'must be an ISO 4217 code')
    .default('SAR')
    .transform((value) => value.toUpperCase()),
  transactionAt: z
    .string()
    .datetime({ offset: true })
    .transform((value) => new Date(value)),
});

export type TransactionPayload = z.infer<typeof transactionPayloadSchema>;

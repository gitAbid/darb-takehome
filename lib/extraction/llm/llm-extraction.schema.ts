import { z } from 'zod';

/**
 * What the model is asked to return — the single source of truth for the prompt (rendered as JSON Schema) and for
 * parsing the reply. Every field is lenient: missing, null or invalid becomes null (or its safe default), so one
 * misread field never discards the rest. Values are raw "as printed"; our code, not the model, converts them.
 */
export const llmExtractionSchema = z.object({
  documentType: z
    .enum(['RECEIPT', 'TAX_INVOICE', 'UNKNOWN'])
    .catch('UNKNOWN')
    .describe('TAX_INVOICE when titled "Tax Invoice" / "فاتورة ضريبية"; RECEIPT for a till or card slip; else UNKNOWN'),
  merchantName: z
    .string()
    .nullable()
    .catch(null)
    .describe('Seller name as printed (the English one when both scripts appear)'),
  vatNumber: z
    .string()
    .nullable()
    .catch(null)
    .describe('Seller VAT registration number (الرقم الضريبي), 15 digits, as printed'),
  invoiceNumber: z.string().nullable().catch(null).describe('Invoice or receipt number as printed'),
  totalAsPrinted: z
    .string()
    .nullable()
    .catch(null)
    .describe('Grand total paid, including VAT, exactly as printed (e.g. "1,234.50"); never a subtotal or VAT line'),
  currency: z.string().nullable().catch(null).describe('Currency of the total as printed (e.g. "SAR", "ر.س", "AED")'),
  dateAsPrinted: z
    .string()
    .nullable()
    .catch(null)
    .describe('Transaction or invoice date exactly as printed (e.g. "14/06/2025")'),
  cardLast4: z
    .string()
    .nullable()
    .catch(null)
    .describe('Last 4 digits of the payment card when printed (e.g. "4471" from "MADA **** 4471")'),
  rawText: z.string().catch('').describe('All legible text, top to bottom, one printed line per line'),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .catch(0)
    .describe('0..1: how sure you are that every field above was read correctly'),
});

export type LlmExtraction = z.infer<typeof llmExtractionSchema>;

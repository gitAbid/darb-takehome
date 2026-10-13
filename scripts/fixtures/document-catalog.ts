/** How each scenario's document is produced (docs/SCENARIOS.md §2). */
export const DOCUMENT_SPECS: readonly DocumentSpec[] = [
  { folder: '01-exact-match', style: 'interim-photo-jpeg' },
  { folder: '02-ambiguous-same-chain', style: 'invoice-pdf' },
  { folder: '03-restaurant-tip', style: 'interim-photo-jpeg' },
  { folder: '05-invoice-no-transaction', style: 'invoice-pdf' },
  { folder: '06-garbage-extraction', style: 'garbage-jpeg' },
  { folder: '07-invoice-after-confirmed-receipt', style: 'invoice-pdf' },
  { folder: '08-shared-last4', style: 'receipt-jpeg' },
  { folder: '09-card-misread', style: 'interim-photo-jpeg' },
  { folder: '10-extractor-error', style: 'invoice-pdf' },
  { folder: '11-unknown-sender', style: 'invoice-pdf' },
  { folder: '12-back-to-back-refuel', style: 'interim-photo-jpeg' },
  { folder: '13-foreign-currency', style: 'receipt-jpeg' },
];

/**
 * Text printed on the document that deliberately differs from what the (mock) OCR reads.
 * 09: the card is 4471; the extraction misreads it as 4477.
 */
export const PRINTED_TEXT_OVERRIDES: Readonly<Record<string, readonly (readonly [string, string])[]>> = {
  '09-card-misread': [['**** 4477', '**** 4471']],
};

/** Lines for documents whose extraction has no text (the extractor-error case). */
export const FALLBACK_LINES: Readonly<Record<string, readonly string[]>> = {
  '10-extractor-error': [
    'TAX INVOICE INV-RS-7781',
    'Tihama Tyres Trading',
    'VAT 301112223300003',
    'Date 2025-06-17',
    'Bill to: Red Sea Transport',
    'Tyre replacement x2',
    'Total incl. VAT SAR 410.00',
  ],
};

export type DocumentStyle = 'invoice-pdf' | 'receipt-jpeg' | 'interim-photo-jpeg' | 'garbage-jpeg';

export interface DocumentSpec {
  folder: string;
  style: DocumentStyle;
}

export function documentFileName(style: DocumentStyle): 'document.pdf' | 'document.jpg' {
  return style === 'invoice-pdf' ? 'document.pdf' : 'document.jpg';
}

/** Scenarios whose final document is a phone photo of a printed receipt. */
export function isPhotoScenario(spec: DocumentSpec): boolean {
  return spec.style === 'interim-photo-jpeg';
}

import type { IgnoreReason } from './inbound-message';

const DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);
const SIGNATURE_IMAGE_MAX_BYTES = 8 * 1024;
const SIGNATURE_IMAGE_NAME = /logo|signature|banner|icon/i;

export interface AttachmentFacts {
  filename: string;
  mimeType: string;
  size: number;
}

/**
 * Decides whether an email attachment is a receipt/invoice. PDFs always are (a text-only invoice can be tiny);
 * small or logo-named images are email signature art. Returns the reason to ignore it, or null to keep it.
 */
export function attachmentIgnoreReason({ filename, mimeType, size }: AttachmentFacts): IgnoreReason | null {
  const type = mimeType.trim().toLowerCase();
  if (!DOCUMENT_MIME_TYPES.has(type) || size === 0) return 'NOT_A_DOCUMENT';
  if (type === 'application/pdf') return null;
  return size < SIGNATURE_IMAGE_MAX_BYTES || SIGNATURE_IMAGE_NAME.test(filename) ? 'SIGNATURE_IMAGE' : null;
}

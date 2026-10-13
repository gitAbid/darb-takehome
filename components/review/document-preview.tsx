import { ExternalLink, FileText } from 'lucide-react';

import { documentFileUrl } from '@/lib/review-ui/review-urls';

/** The original file: images inline (tap to enlarge), PDFs embedded on wide screens and linked everywhere. */
export function DocumentPreview({ documentId, isImage }: { documentId: number; isImage: boolean }) {
  const src = documentFileUrl(documentId);
  if (isImage) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="group block overflow-hidden rounded-lg border bg-muted/40 transition hover:border-foreground/20"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- private, already-optimized document bytes */}
        <img
          src={src}
          alt="Receipt photo"
          width={1600}
          height={1100}
          fetchPriority="high"
          className="h-auto max-h-52 w-full object-contain transition duration-300 group-hover:scale-[1.02] sm:max-h-72 lg:max-h-80"
        />
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/40">
      <object data={src} type="application/pdf" className="hidden h-80 w-full lg:block" aria-label="Invoice PDF" />
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted lg:border-t"
      >
        <FileText className="size-4" /> Open invoice PDF{' '}
        <ExternalLink className="ml-auto size-3.5 text-muted-foreground" />
      </a>
    </div>
  );
}

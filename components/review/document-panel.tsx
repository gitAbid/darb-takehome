import type { DocumentView } from '@/lib/review-ui/view-models';

import { ChannelIcon } from './channel-icon';
import { DocumentPreview } from './document-preview';
import { ReasonBadge } from './reason-badge';

/** What the driver or supplier sent: the extracted facts next to the original file. */
export function DocumentPanel({ document }: { document: DocumentView }) {
  return (
    <section
      aria-labelledby="document-title"
      className="rounded-xl border bg-card p-4 shadow-xs sm:p-5 xl:sticky xl:top-0"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ChannelIcon channel={document.channel} className="size-3.5" />
            {document.documentType} · received {document.receivedAt}
          </p>
          <h2 id="document-title" className="mt-1 truncate text-lg font-semibold tracking-tight sm:text-xl">
            {document.title}
          </h2>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold tabular-nums sm:text-2xl">{document.total}</p>
          <p className="text-xs text-muted-foreground">{document.documentDay}</p>
        </div>
      </div>
      {document.reasons.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {document.reasons.map((code) => (
            <ReasonBadge key={code} code={code} />
          ))}
        </div>
      )}
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] xl:grid-cols-1">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 self-start text-sm">
          {document.fields.map((field) => (
            <div key={field.label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{field.label}</dt>
              <dd className="truncate font-medium">{field.value}</dd>
            </div>
          ))}
          <div className="col-span-2 min-w-0">
            <dt className="text-xs text-muted-foreground">From</dt>
            <dd className="truncate font-medium">{document.sender}</dd>
          </div>
        </dl>
        {document.hasFile && <DocumentPreview documentId={document.documentId} isImage={document.isImage} />}
      </div>
    </section>
  );
}

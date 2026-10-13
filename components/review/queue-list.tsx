import Link from 'next/link';

import type { QueueRowView } from '@/lib/review-ui/view-models';
import { cn } from '@/lib/utils';

import { ChannelIcon } from './channel-icon';
import { ReasonBadge } from './reason-badge';

/** The queue, oldest first. Each row carries enough to triage without opening it. */
export function QueueList({ rows, selectedId }: { rows: QueueRowView[]; selectedId: number | null }) {
  return (
    <nav aria-label="Documents to review">
      <ol className="divide-y divide-border/60">
        {rows.map((row) => {
          const selected = row.documentId === selectedId;
          return (
            <li key={row.documentId}>
              <Link
                href={`/review?doc=${row.documentId}`}
                scroll={false}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'group relative flex flex-col gap-1.5 px-4 py-3 transition-colors outline-none',
                  'hover:bg-muted/60 focus-visible:bg-muted/60',
                  selected && 'bg-muted',
                )}
              >
                {selected && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary" aria-hidden />}
                <div className="flex items-center gap-2">
                  <ChannelIcon channel={row.channel} className="text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{row.title}</span>
                  <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{row.amount}</span>
                </div>
                <div className="flex items-center gap-1.5 pl-6">
                  {row.reasons.slice(0, 2).map((code) => (
                    <ReasonBadge key={code} code={code} />
                  ))}
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {row.pendingCandidates} option{row.pendingCandidates === 1 ? '' : 's'} · {row.age}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

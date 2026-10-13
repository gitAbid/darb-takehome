import type { DocumentStatus } from '@/lib/domain/statuses';
import { cn } from '@/lib/utils';

const SHOWN: { status: DocumentStatus; label: string; dot: string }[] = [
  { status: 'NEEDS_REVIEW', label: 'To review', dot: 'bg-amber-500' },
  { status: 'MATCHED', label: 'Matched', dot: 'bg-emerald-500' },
  { status: 'UNMATCHED', label: 'Unmatched', dot: 'bg-muted-foreground/50' },
  { status: 'FAILED', label: 'Failed', dot: 'bg-rose-500' },
];

/** Pipeline health at a glance. Hidden labels on narrow screens keep the header to one line. */
export function StatusCounts({ counts, className }: { counts: Record<DocumentStatus, number>; className?: string }) {
  return (
    <dl className={cn('flex items-center gap-3 text-xs sm:gap-4', className)}>
      {SHOWN.map(({ status, label, dot }) => (
        <div key={status} className="flex items-center gap-1.5" title={label}>
          <span className={cn('size-2 rounded-full', dot)} aria-hidden />
          <dt className="sr-only sm:not-sr-only sm:text-muted-foreground">{label}</dt>
          <dd className="font-semibold tabular-nums">{counts[status]}</dd>
        </div>
      ))}
    </dl>
  );
}

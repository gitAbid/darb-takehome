import { CheckCircle2 } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/10">
        <CheckCircle2 className="size-6 text-emerald-600 dark:text-emerald-400" />
      </span>
      <h2 className="text-lg font-semibold tracking-tight">All caught up</h2>
      <p className="max-w-xs text-sm text-muted-foreground">
        Nothing needs a human decision right now. New documents appear here as soon as the matcher is unsure.
      </p>
    </div>
  );
}

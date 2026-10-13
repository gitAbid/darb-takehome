'use client';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ReasonCode } from '@/lib/domain/reason-codes';
import { REASON_COPY } from '@/lib/review-ui/reasons';
import { cn } from '@/lib/utils';

import { REASON_BADGE } from './tones';

/** A reason code as a short coloured label; the tooltip says what to check. */
export function ReasonBadge({ code, className }: { code: ReasonCode; className?: string }) {
  const copy = REASON_COPY[code];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className={cn(
            'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap',
            REASON_BADGE[copy.tone],
            className,
          )}
        >
          {copy.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{copy.hint}</TooltipContent>
    </Tooltip>
  );
}

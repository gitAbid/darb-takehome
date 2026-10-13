/** Skeleton shown while the queue loads, matching the real layout to avoid a jump. */
export default function Loading() {
  return (
    <div className="flex h-dvh flex-col" aria-busy>
      <div className="h-14 border-b" />
      <div className="grid flex-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
        <div className="space-y-px border-r">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-[68px] animate-pulse bg-muted/40" />
          ))}
        </div>
        <div className="hidden space-y-4 p-6 lg:block">
          <div className="h-56 animate-pulse rounded-xl bg-muted/50" />
          <div className="h-48 animate-pulse rounded-xl bg-muted/50" />
        </div>
      </div>
    </div>
  );
}

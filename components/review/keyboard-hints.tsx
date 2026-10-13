const HINTS = [
  ['J', 'K', 'next / previous'],
  ['1–5', null, 'pick candidate'],
  ['↵', 'C', 'confirm'],
  ['X', null, 'reject'],
] as const;

/** Shortcut legend for keyboard users; hidden on touch-sized screens where it cannot be used. */
export function KeyboardHints() {
  return (
    <footer className="sticky bottom-0 hidden shrink-0 items-center justify-center gap-5 border-t bg-background/80 px-4 py-2 text-[11px] text-muted-foreground backdrop-blur md:flex">
      {HINTS.map(([first, second, label]) => (
        <span key={label} className="flex items-center gap-1">
          <kbd className="rounded border px-1 font-sans leading-4">{first}</kbd>
          {second && <kbd className="rounded border px-1 font-sans leading-4">{second}</kbd>}
          <span className="ml-0.5">{label}</span>
        </span>
      ))}
    </footer>
  );
}

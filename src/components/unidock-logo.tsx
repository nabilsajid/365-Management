import { useId } from 'react';

/** The UniDock mark: a U and a D joined (the U's right arm is the D's stem), on the warm accent. */
export function UniDockMark({ size = 28 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className="shrink-0">
      <defs>
        <linearGradient id={`ud-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#eaa77a" />
          <stop offset="1" stopColor="#b0643f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#ud-${id})`} />
      <path d="M7.5 9v7.5a4.25 4.25 0 0 0 8.5 0V9" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 9h3a6.5 6.5 0 0 1 0 13h-3" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The mark with the UniDock name beside it. */
export function UniDockLogo() {
  return (
    <span className="unidock-logo" aria-label="UniDock">
      <UniDockMark size={28} />
      <span aria-hidden>
        Uni<b>Dock</b>
      </span>
    </span>
  );
}

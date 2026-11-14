import { useId } from 'react';

/** The UniDock app mark: a dock (the U) holding one item, on the warm accent. */
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
      <path d="M9 8.5v8.5a7 7 0 0 0 14 0V8.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      <rect x="13" y="13" width="6" height="6" rx="1.8" fill="#fff" fillOpacity="0.9" />
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

/** The UniDock mark: a U and a D joined (the U's right arm is the D's stem), in black and white, like the app icon. */
export function UniDockMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden className="shrink-0">
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" fill="#0a0a0a" stroke="#ffffff" strokeOpacity="0.22" />
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

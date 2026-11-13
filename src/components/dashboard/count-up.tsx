'use client';

import { useEffect, useRef, useState } from 'react';

function format(value: number, kind: 'number' | 'money'): string {
  const text = Math.round(value).toLocaleString('en-US');
  return kind === 'money' ? `৳${text}` : text;
}

/**
 * Counts up to a number once when it first appears. The final value is in the
 * server-rendered HTML, so nothing is lost without JavaScript or with reduced motion.
 */
export function CountUp({ value, kind = 'number', duration = 700 }: { value: number; kind?: 'number' | 'money'; duration?: number }) {
  const [shown, setShown] = useState(value);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      setShown(value);
      return;
    }
    started.current = true;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || value === 0) return;

    let frame = 0;
    const begin = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - begin) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(value * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    setShown(0);
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  return <span className="tabular-nums">{format(shown, kind)}</span>;
}

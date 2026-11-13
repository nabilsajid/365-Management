'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

/** A thin bar at the top of the screen while the next page is on its way, so every tap gets an instant response. */
function Bar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const giveUp = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Start as soon as a link inside the app is tapped.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.('a');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      setState('loading');
      clearTimeout(giveUp.current);
      giveUp.current = setTimeout(() => setState('idle'), 10000);
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
      clearTimeout(giveUp.current);
    };
  }, []);

  // Finish when the new page is showing.
  useEffect(() => {
    clearTimeout(giveUp.current);
    setState((current) => (current === 'loading' ? 'done' : current));
    const reset = setTimeout(() => setState('idle'), 350);
    return () => clearTimeout(reset);
  }, [pathname, search]);

  if (state === 'idle') return null;
  return <div className={state === 'loading' ? 'nav-progress' : 'nav-progress nav-progress-done'} aria-hidden />;
}

export function NavProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}

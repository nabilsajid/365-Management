'use client';

import { CloudOff, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Shown in place of a page that failed to load. Without a connection this is
 * usually a page that was never saved on the device, so it says so plainly
 * instead of showing a technical error.
 */
export default function SectionError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return (
    <section className="panel mx-auto max-w-xl text-center">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-muted" aria-hidden>
        <CloudOff size={18} />
      </span>
      <h2 className="text-base font-semibold">{offline ? "You're offline" : 'This section could not load'}</h2>
      <p className="muted mt-1">
        {offline
          ? "This section hasn't been saved on this device yet. Open it once while you're connected and it will work offline after that."
          : 'Something went wrong while loading it. Please try again.'}
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-control border border-line px-3 py-2 text-[13px] font-medium hover:bg-subtle"
          onClick={() => (offline ? window.location.reload() : reset())}
        >
          <RotateCcw size={14} aria-hidden />
          Try again
        </button>
      </div>
    </section>
  );
}

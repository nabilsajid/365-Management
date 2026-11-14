'use client';

import { Loader2, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

/** The Search page box: results update while typing, without pressing Enter. */
export function LiveSearchInput({ initial }: { initial: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [text, setText] = useState(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const timer = setTimeout(() => {
      const query = text.trim();
      startTransition(() => router.replace(query ? `${pathname}?q=${encodeURIComponent(query)}` : pathname, { scroll: false }));
    }, 250);
    return () => clearTimeout(timer);
  }, [text, pathname, router]);

  return (
    <form action="/search" className="search-page-form" role="search" onSubmit={(event) => event.preventDefault()}>
      {pending ? <Loader2 size={16} aria-hidden className="spin" /> : <Search size={16} aria-hidden />}
      <input
        name="q"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Type at least two letters…"
        aria-label="Search"
        autoComplete="off"
        autoFocus
      />
    </form>
  );
}

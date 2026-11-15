'use client';

import { Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { SearchGroup } from '@/lib/services/search';
import { SearchIcon } from './search-icons';

/**
 * The top-bar search: suggestions appear while typing (from two letters on).
 * Arrow keys move through them, Enter opens one, or opens the full results
 * page when none is picked. Escape closes the list.
 */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLFormElement>(null);
  const [text, setText] = useState('');
  const [groups, setGroups] = useState<SearchGroup[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const items = groups.flatMap((group) => group.items.map((item) => ({ ...item, kind: group.kind })));
  const query = text.trim();

  // Asks for suggestions a moment after typing stops; older answers are dropped.
  useEffect(() => {
    if (query.length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal, cache: 'no-store' });
        const result = (await response.json()) as { data?: SearchGroup[] };
        setGroups(result.data ?? []);
        setActive(-1);
      } catch {
        // Offline or replaced by newer typing: keep what is shown.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Clicking anywhere else closes the list.
  useEffect(() => {
    function away(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, []);

  function go(href: string) {
    setOpen(false);
    setText('');
    router.push(href);
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(index + 1, items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, -1));
    } else if (event.key === 'Escape') {
      setOpen(false);
      setActive(-1);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (active >= 0 && active < items.length) return go(items[active].href);
    if (query) go(`/search?q=${encodeURIComponent(query)}`);
  }

  const showList = open && query.length >= 2;
  let index = -1;

  return (
    <form ref={box} action="/search" role="search" className="topbar-search" onSubmit={submit}>
      {loading ? <Loader2 size={15} aria-hidden className="spin" /> : <Search size={15} aria-hidden />}
      <input
        name="q"
        value={text}
        autoComplete="off"
        placeholder="Search anything"
        aria-label="Search projects, tasks, clients and people"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(event) => {
          setText(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
      />
      {showList ? (
        <div className="search-suggest" id={listId} role="listbox">
          {groups.length === 0 ? (
            <p className="search-suggest-empty">{loading ? 'Searching…' : `Nothing matches “${query}”.`}</p>
          ) : (
            groups.map((group) => (
              <div key={group.kind} role="group" aria-label={group.title}>
                <p className="search-suggest-title">{group.title}</p>
                {group.items.map((item) => {
                  index += 1;
                  const mine = index;
                  return (
                    <button
                      key={`${group.kind}-${mine}`}
                      type="button"
                      id={`${listId}-${mine}`}
                      role="option"
                      aria-selected={active === mine}
                      className={active === mine ? 'active' : undefined}
                      onMouseEnter={() => setActive(mine)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => go(item.href)}
                    >
                      <SearchIcon kind={group.kind} size={14} />
                      <span className="search-suggest-text">
                        <Highlight text={item.title} query={query} />
                        {item.detail ? <small>{item.detail}</small> : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
          <button
            type="button"
            id={`${listId}-${items.length}`}
            role="option"
            aria-selected={active === items.length}
            className={active === items.length ? 'active search-suggest-all' : 'search-suggest-all'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => go(`/search?q=${encodeURIComponent(query)}`)}
          >
            See all results for “{query}”
          </button>
        </div>
      ) : null}
    </form>
  );
}

/** The matched part of a result in bold. */
export function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, at)}
      <mark>{text.slice(at, at + query.length)}</mark>
      {text.slice(at + query.length)}
    </span>
  );
}

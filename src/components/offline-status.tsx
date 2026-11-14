'use client';

import { CloudOff, RefreshCw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QUEUE_EVENT, clearFailures, failures, flush, setQueueUser, waiting, type FailedAction, type QueuedAction } from '@/lib/offline-queue';
import { toast } from './resource-manager';

/** Starting points for what is kept on the device: every section of the sidebar. */
const KEEP = [
  '/dashboard', '/calendar', '/updates', '/updates?tab=broadcasts', '/updates?tab=messages', '/projects', '/projects?view=list', '/my-tasks', '/my-tasks?view=list',
  '/cashflow', '/logistics', '/employees', '/profile', '/profile?tab=me', '/profile?tab=team', '/approvals', '/requests',
  '/roles', '/settings', '/leave',
];
const KEEP_EVERY = 30 * 60 * 1000;
const KEPT_KEY = 'offline-kept-at';
const MAX_PAGES = 90;

const decode = (href: string) => href.replace(/&amp;/g, '&');

/** The app's own code, styles and fonts a page needs to work, as listed in its HTML. */
function assetsIn(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\/_next\/static\/[^"'\s\\]+/g)) found.add(match[0]);
  // Code for parts that load later is named inside the page's data, without the leading /_next/.
  for (const match of html.matchAll(/"(static\/(?:chunks|css|media)\/[^"\\]+)/g)) found.add(`/_next/${match[1]}`);
  return [...found];
}

/** Other pages of the app a page links to: its tabs, projects and tasks. */
function pagesIn(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/href="(\/[a-z-]+(?:\/[0-9a-f-]{36})?(?:\?[^"#]*)?)"/g)) {
    const href = decode(match[1]);
    if (/^\/(api|auth|login|signup|_next)/.test(href)) continue;
    found.add(href);
  }
  return [...found];
}

/**
 * Opens every section in the background, then the tabs, projects and tasks
 * they link to, and fetches the code each one needs. The service worker keeps
 * a copy of each, so the whole app can be opened without a connection.
 */
async function keepAppForOffline(): Promise<void> {
  const pages = new Set<string>();
  const assets = new Set<string>();
  const grab = async (path: string): Promise<string> => {
    if (pages.has(path) || pages.size >= MAX_PAGES || !navigator.onLine) return '';
    pages.add(path);
    try {
      const response = await fetch(path, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
      // A redirect means this person cannot open that section; skip it.
      if (!response.ok || response.redirected) return '';
      const html = await response.text();
      for (const asset of assetsIn(html)) assets.add(asset);
      return html;
    } catch {
      return '';
    }
  };

  const next: string[] = [];
  for (const path of KEEP) next.push(...pagesIn(await grab(path)));
  for (const path of [...new Set(next)]) await grab(path);
  // Also the code of the page that is open now.
  for (const asset of assetsIn(document.documentElement.outerHTML)) assets.add(asset);

  for (const asset of assets) {
    try {
      await fetch(asset, { credentials: 'same-origin' });
    } catch {
      // Missing one file only affects the page that needs it.
    }
  }
}

/**
 * Offline support for the signed-in app:
 * - says when there is no connection, and how many changes are waiting;
 * - sends waiting changes when the connection returns, and lists any the server turned down;
 * - keeps copies of the main pages on the device while there is a connection.
 */
export function OfflineStatus({ userId }: { userId: string }) {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [failed, setFailed] = useState<FailedAction[]>([]);
  const [open, setOpen] = useState(false);
  const sending = useRef(false);

  const sync = useCallback(() => {
    setQueue(waiting(userId));
    setFailed(failures(userId));
  }, [userId]);

  const send = useCallback(async () => {
    if (sending.current || !navigator.onLine || waiting(userId).length === 0) return;
    sending.current = true;
    try {
      const result = await flush(userId);
      if (result.sent > 0) toast(`${result.sent} offline ${result.sent === 1 ? 'change' : 'changes'} sent`, 'success');
      if (result.sent > 0 || result.rejected > 0) router.refresh();
      if (result.rejected > 0) setOpen(true);
    } finally {
      sending.current = false;
      sync();
    }
  }, [router, sync, userId]);

  useEffect(() => {
    setQueueUser(userId);
    setOnline(navigator.onLine);
    sync();
    void send();

    const onOnline = () => {
      setOnline(true);
      void send();
      // Back online: refresh what the pages show, since they may be saved copies.
      router.refresh();
    };
    const onOffline = () => setOnline(false);
    const onVisible = () => {
      if (!document.hidden) void send();
    };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener(QUEUE_EVENT, sync);
    document.addEventListener('visibilitychange', onVisible);
    // Some phones never fire "online"; a slow retry covers them.
    const retry = setInterval(() => void send(), 30000);

    // Keep the main pages on the device, now and then, while connected.
    const keep = setTimeout(() => {
      try {
        const last = Number(window.localStorage.getItem(KEPT_KEY) ?? 0);
        if (!navigator.onLine || !('serviceWorker' in navigator) || Date.now() - last < KEEP_EVERY) return;
        window.localStorage.setItem(KEPT_KEY, String(Date.now()));
        void keepAppForOffline();
      } catch {
        // Without storage the app still works; pages are simply saved as they are visited.
      }
    }, 4000);

    // If a page's code cannot be loaded without a connection, reload once: the
    // service worker then opens the saved copy of the page instead of an error.
    const onCodeMissing = (event: ErrorEvent | PromiseRejectionEvent) => {
      if (navigator.onLine) return;
      const reason = 'reason' in event ? event.reason : event.error;
      const text = `${reason?.name ?? ''} ${reason?.message ?? ''} ${'message' in event ? event.message : ''}`;
      if (!/ChunkLoadError|Loading (CSS )?chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text)) return;
      try {
        const key = `offline-reloaded:${window.location.pathname}${window.location.search}`;
        if (window.sessionStorage.getItem(key)) return;
        window.sessionStorage.setItem(key, '1');
      } catch {
        return;
      }
      window.location.reload();
    };
    window.addEventListener('error', onCodeMissing);
    window.addEventListener('unhandledrejection', onCodeMissing);

    return () => {
      window.removeEventListener('error', onCodeMissing);
      window.removeEventListener('unhandledrejection', onCodeMissing);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(QUEUE_EVENT, sync);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(retry);
      clearTimeout(keep);
    };
  }, [router, send, sync, userId]);

  if (online && queue.length === 0 && failed.length === 0) return null;

  return (
    <div className={online ? 'offline-bar offline-bar-online' : 'offline-bar'} role="status">
      <div className="offline-line">
        <span>
          {online ? <RefreshCw size={14} aria-hidden /> : <CloudOff size={14} aria-hidden />}
          {online
            ? queue.length > 0
              ? `Sending ${queue.length} ${queue.length === 1 ? 'change' : 'changes'} made offline…`
              : `${failed.length} offline ${failed.length === 1 ? 'change was' : 'changes were'} not applied.`
            : queue.length > 0
              ? `You're offline. ${queue.length} ${queue.length === 1 ? 'change is' : 'changes are'} saved on this device and will be sent when you're back online.`
              : "You're offline. You are seeing the last saved copy of each page; some things need a connection."}
        </span>
        {queue.length > 0 || failed.length > 0 ? (
          <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            {open ? 'Hide' : 'Details'}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="offline-list">
          {queue.length > 0 ? (
            <>
              <p>Waiting to send</p>
              <ul>
                {queue.map((item) => (
                  <li key={item.id}>{item.label}</li>
                ))}
              </ul>
            </>
          ) : null}
          {failed.length > 0 ? (
            <>
              <p>
                Not applied
                <button
                  type="button"
                  aria-label="Clear this list"
                  onClick={() => {
                    clearFailures(userId);
                    sync();
                  }}
                >
                  <X size={12} aria-hidden /> Clear
                </button>
              </p>
              <ul>
                {failed.map((item) => (
                  <li key={item.id}>
                    <strong>{item.label}</strong>: {item.reason}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

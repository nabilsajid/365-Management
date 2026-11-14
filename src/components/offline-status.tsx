'use client';

import { CloudOff, RefreshCw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { QUEUE_EVENT, clearFailures, failures, flush, setQueueUser, waiting, type FailedAction, type QueuedAction } from '@/lib/offline-queue';
import { toast } from './resource-manager';

/** Pages worth having on the device, so they open without a connection. */
const KEEP = ['/dashboard', '/my-tasks', '/projects', '/notices', '/broadcasts', '/profile?tab=team', '/profile?tab=me', '/logistics'];
const KEEP_EVERY = 30 * 60 * 1000;
const KEPT_KEY = 'offline-kept-at';

/** Fetches the main pages, and the tasks and projects they link to, so the service worker saves a copy of each. */
async function keepPagesForOffline(): Promise<void> {
  const seen = new Set<string>();
  const grab = async (path: string): Promise<string> => {
    if (seen.has(path)) return '';
    seen.add(path);
    try {
      const response = await fetch(path, { headers: { Accept: 'text/html' }, credentials: 'same-origin' });
      return response.ok ? await response.text() : '';
    } catch {
      return '';
    }
  };
  const linked: string[] = [];
  for (const path of KEEP) {
    const html = await grab(path);
    for (const match of html.matchAll(/href="(\/(?:tasks|projects)\/[0-9a-f-]{36})"/g)) linked.push(match[1]);
  }
  for (const path of [...new Set(linked)].slice(0, 30)) await grab(path);
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
        void keepPagesForOffline();
      } catch {
        // Without storage the app still works; pages are simply saved as they are visited.
      }
    }, 4000);

    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener(QUEUE_EVENT, sync);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(retry);
      clearTimeout(keep);
    };
  }, [send, sync, userId]);

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

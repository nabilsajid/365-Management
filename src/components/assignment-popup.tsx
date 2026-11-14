'use client';

import { BellRing } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Celebration } from './celebration';

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
}

/** Where a notification belongs, from the page it points to. */
function sectionOf(href: string | null): { href: string; label: string } {
  const path = href ?? '';
  if (path.startsWith('/approvals') || path.includes('#award')) return { href: '/approvals', label: 'Open Approvals' };
  if (path.startsWith('/updates')) return { href: path.includes('tab=messages') ? '/updates?tab=messages' : path.includes('tab=broadcasts') ? '/updates?tab=broadcasts' : '/updates', label: 'Open Updates' };
  if (path.startsWith('/tasks') || path.startsWith('/projects')) return { href: '/my-tasks', label: 'Open My Tasks' };
  if (path.startsWith('/leave')) return { href: '/leave', label: 'Open Leave' };
  return { href: path || '/dashboard', label: 'Open' };
}

/** One button per kind of news, most recent kind first: Approvals, Updates or My Tasks, never a wrong one. */
function destinations(items: NotificationItem[]): { href: string; label: string }[] {
  const seen = new Map<string, { href: string; label: string }>();
  for (const item of items) {
    const place = sectionOf(item.href);
    if (!seen.has(place.label)) seen.set(place.label, place);
  }
  return [...seen.values()].slice(0, 2);
}

/** Shown while there are unread notifications: a new assignment, a notice, or (for admins) something to approve. */
export function AssignmentPopup({ items: all }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(all.length > 0);
  const [busy, setBusy] = useState(false);
  // Finished work gets its own moment first: fireworks and "Well done!".
  const wins = all.filter((item) => item.title.startsWith('Well done!'));
  const items = all.filter((item) => !item.title.startsWith('Well done!'));
  const [celebrating, setCelebrating] = useState(wins.length > 0);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void done(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || all.length === 0) return null;

  if (celebrating) {
    return (
      <Celebration
        items={wins}
        busy={busy}
        onClose={(goTo) => {
          // Other news waits behind the celebration; with none, everything is marked read now.
          if (items.length > 0 && !goTo) setCelebrating(false);
          else void done(goTo);
        }}
      />
    );
  }

  async function done(goTo: string | null) {
    setBusy(true);
    try {
      await fetch('/api/notifications/read', { method: 'POST' });
    } catch {
      // If this fails the pop-up simply shows again next time.
    }
    setOpen(false);
    if (goTo) router.push(goTo);
    router.refresh();
  }

  return (
    <div className="popup-back" role="dialog" aria-modal="true" aria-labelledby="popup-title">
      <div className="popup">
        <span className="popup-icon" aria-hidden>
          <BellRing size={20} />
        </span>
        <h2 id="popup-title">{items.length === 1 ? 'Something new for you' : `${items.length} new things for you`}</h2>
        <ul className="popup-list">
          {items.map((item) => (
            <li key={item.id}>
              {item.href ? (
                <button type="button" className="popup-link" disabled={busy} onClick={() => done(item.href)}>
                  <strong>{item.title}</strong>
                  {item.body ? <span>{item.body}</span> : null}
                </button>
              ) : (
                <>
                  <strong>{item.title}</strong>
                  {item.body ? <span>{item.body}</span> : null}
                </>
              )}
            </li>
          ))}
        </ul>
        <p className="muted">
          Tap one to open it. To get these as alerts on your phone or computer, turn them on under Profiles &amp;
          Contacts → My profile.
        </p>
        <div className="popup-actions">
          {destinations(items).map((place, index) => (
            <button key={place.href} type="button" className={index === 0 ? 'primary' : undefined} disabled={busy} onClick={() => done(place.href)}>
              {place.label}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => done(null)}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

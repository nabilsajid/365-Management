'use client';

import { BellRing } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
}

/** Shown after sign-in while there are unread notifications, such as a newly assigned project or task. */
export function AssignmentPopup({ items }: { items: NotificationItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(items.length > 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void done(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || items.length === 0) return null;

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
        <h2 id="popup-title">{items.length === 1 ? 'You have a new assignment' : `You have ${items.length} new assignments`}</h2>
        <ul className="popup-list">
          {items.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              {item.body ? <span>{item.body}</span> : null}
            </li>
          ))}
        </ul>
        <p className="muted">You can find everything assigned to you under My Tasks.</p>
        <div className="popup-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => done('/my-tasks')}>
            Open My Tasks
          </button>
          <button type="button" disabled={busy} onClick={() => done(null)}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

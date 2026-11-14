'use client';

import { BookOpen } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

/** Shown once, right after a new person saves their profile: an invitation to read the team guide. */
export function GuideWelcome({ firstName, orgName }: { firstName: string; orgName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function answer(read: boolean) {
    setBusy(true);
    try {
      await fetch('/api/profile/guide-seen', { method: 'POST' });
    } catch {
      // If this fails the invitation simply shows again next time.
    }
    setOpen(false);
    if (read) router.push('/updates#guide');
    else router.refresh();
  }

  return (
    <div className="popup-back" role="dialog" aria-modal="true" aria-labelledby="welcome-title">
      <div className="popup welcome">
        <span className="popup-icon" aria-hidden>
          <BookOpen size={20} />
        </span>
        <h2 id="welcome-title">Welcome to {orgName}, {firstName}!</h2>
        <p>
          Your profile is saved. Before you start, take a few minutes to read the team guide: how the app works, what
          your role can do, how tasks, attendance and points work, and who to ask for help.
        </p>
        <p className="muted">You can find it any time under Updates → Announcements, pinned at the top.</p>
        <div className="popup-actions">
          <button type="button" className="primary" disabled={busy} onClick={() => answer(true)}>
            Read the team guide
          </button>
          <button type="button" disabled={busy} onClick={() => answer(false)}>
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

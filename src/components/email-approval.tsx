'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from './resource-manager';

/** One waiting email: read and change its subject and message, then send it or not. */
export function EmailApproval({
  id,
  to,
  kindLabel,
  subject,
  body,
  failed,
  error,
}: {
  id: string;
  to: string;
  kindLabel: string;
  subject: string;
  body: string;
  failed: boolean;
  error: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState({ subject, body });
  const [busy, setBusy] = useState<'send' | 'reject' | null>(null);
  const [problem, setProblem] = useState<string | null>(failed ? error : null);
  const [, startTransition] = useTransition();

  async function decide(action: 'send' | 'reject') {
    setBusy(action);
    setProblem(null);
    const response = await fetch(`/api/emails/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...values }),
    });
    setBusy(null);
    const result = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!response.ok) {
      setProblem(result?.error?.message ?? `Could not do that (${response.status}).`);
      startTransition(() => router.refresh());
      return;
    }
    toast(action === 'send' ? `Sent to ${to}` : 'Not sent', action === 'send' ? 'success' : undefined);
    startTransition(() => router.refresh());
  }

  return (
    <article className="email-draft">
      <div className="tags">
        <span className="badge">{kindLabel}</span>
        <span className="muted">To {to}</span>
        {failed ? <span className="badge badge-changes_requested">Failed to send</span> : null}
      </div>
      <label className="field">
        <span>Subject</span>
        <input value={values.subject} maxLength={200} onChange={(event) => setValues({ ...values, subject: event.target.value })} />
      </label>
      <label className="field">
        <span>Message</span>
        <textarea rows={Math.min(16, Math.max(6, values.body.split('\n').length + 1))} value={values.body} onChange={(event) => setValues({ ...values, body: event.target.value })} />
      </label>
      {problem ? (
        <p className="error" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="primary" onClick={() => decide('send')} disabled={busy !== null}>
          {busy === 'send' ? 'Sending…' : failed ? 'Try again' : 'Approve and send'}
        </button>
        <button type="button" onClick={() => decide('reject')} disabled={busy !== null}>
          {busy === 'reject' ? 'Saving…' : "Don't send"}
        </button>
      </div>
    </article>
  );
}

'use client';

import { useEffect, useState, type FormEvent } from 'react';

/** On the client review page: approve a deliverable or ask for changes. */
export function ReviewForm({ token, taskId, endpoint }: { token: string; taskId: string; endpoint?: string }) {
  const [name, setName] = useState('');
  const [decision, setDecision] = useState<'approved' | 'changes'>('approved');
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  // The name is remembered on this device, so it is typed once.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('review-name');
      if (saved) setName(saved);
    } catch {}
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError('Write your name.');
    if (decision === 'changes' && !comment.trim()) return setError('Tell the team what to change.');
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint ?? `/api/review/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, name: name.trim(), decision, comment: comment.trim() || null }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? 'Your answer could not be sent.');
        return;
      }
      try {
        localStorage.setItem('review-name', name.trim());
      } catch {}
      setSent(true);
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <p className="review-form" role="status">
        Thank you — the team has been told.{' '}
        <button type="button" onClick={() => { setSent(false); setComment(''); }}>
          Send another note
        </button>
      </p>
    );
  }

  return (
    <form className="review-form" onSubmit={send}>
      <div className="choices" role="radiogroup" aria-label="Your answer">
        <label className="choice">
          <input type="radio" name={`d-${taskId}`} checked={decision === 'approved'} onChange={() => setDecision('approved')} /> Approve
        </label>
        <label className="choice">
          <input type="radio" name={`d-${taskId}`} checked={decision === 'changes'} onChange={() => setDecision('changes')} /> Ask for changes
        </label>
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={2000}
        rows={3}
        placeholder={decision === 'changes' ? 'What should change?' : 'Any note (optional)'}
        aria-label="Comment"
      />
      <div className="share-link">
        <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Your name" aria-label="Your name" />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </form>
  );
}

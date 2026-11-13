'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from './resource-manager';

/** Admin: empty the delete log, after confirming on the page. */
export function ClearLog({ count }: { count: number }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (count === 0) return null;

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/delete-log', { method: 'DELETE' });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      toast('Delete log cleared.');
      setConfirming(false);
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="action">
      {confirming ? (
        <>
          <span className="muted">Clear all {count} entries?</span>{' '}
          <button type="button" className="danger" disabled={busy} onClick={clear}>
            {busy ? 'Clearing…' : 'Yes, clear'}
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="danger" onClick={() => setConfirming(true)}>
          <Trash2 size={14} aria-hidden style={{ marginRight: 6 }} />
          Clear log
        </button>
      )}
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

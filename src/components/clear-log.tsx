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

  if (confirming) {
    return (
      <div className="clear-confirm" role="alertdialog" aria-label="Clear the delete log">
        <p>
          Clear all {count} {count === 1 ? 'entry' : 'entries'}? This cannot be undone.
        </p>
        <div className="clear-confirm-actions">
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
          <button type="button" className="danger solid" disabled={busy} onClick={clear}>
            {busy ? 'Clearing…' : 'Yes, clear all'}
          </button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <button type="button" className="danger" onClick={() => setConfirming(true)}>
      <Trash2 size={14} aria-hidden style={{ marginRight: 6 }} />
      Clear log
    </button>
  );
}

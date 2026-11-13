'use client';

import { Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from './resource-manager';

/** Admin only: delete a project with everything in it, after confirming on the page. */
export function DeleteProject({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      toast('Project deleted.');
      router.push('/projects');
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
          <span className="muted">Delete “{name}” with its deliverables and comments? This cannot be undone.</span>{' '}
          <button type="button" className="danger" disabled={busy} onClick={remove}>
            {busy ? 'Deleting…' : 'Yes, delete'}
          </button>{' '}
          <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="danger" onClick={() => setConfirming(true)}>
          <Trash2 size={14} aria-hidden style={{ marginRight: 6 }} />
          Delete project
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

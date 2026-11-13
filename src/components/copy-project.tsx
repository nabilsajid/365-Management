'use client';

import { CopyPlus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from './resource-manager';

/**
 * Starts a new project from this one: same client, brief, team and list of
 * deliverables (types, notes and assignees), with no dates, links or progress.
 */
export function CopyProject({ payload }: { payload: Record<string, unknown> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => null)) as { data?: { id?: string }; error?: { message?: string } } | null;
      if (response.status === 202) {
        toast('Sent to an admin for approval.');
        return;
      }
      if (!response.ok || !result?.data?.id) {
        setError(result?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      toast('Project copied. Rename it and set its dates.', 'success');
      router.push(`/projects/${result.data.id}`);
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="action">
      <button type="button" onClick={copy} disabled={busy} title="Start the next batch for this client from the same list of deliverables">
        <CopyPlus size={14} aria-hidden style={{ marginRight: 6 }} />
        {busy ? 'Copying…' : 'Copy as new project'}
      </button>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

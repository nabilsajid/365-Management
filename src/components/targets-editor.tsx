'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { TASK_KIND_LABEL, TASK_KINDS, type TaskKind } from '@/lib/domain/deliverables';
import { toast } from './resource-manager';

/** How many of each type a monthly client gets per month. All optional. */
export function TargetsEditor({ projectId, initial }: { projectId: string; initial: Partial<Record<TaskKind, number>> }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(TASK_KINDS.map((kind) => [kind, initial[kind] ? String(initial[kind]) : ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function save(event: FormEvent) {
    event.preventDefault();
    const targets: Record<string, number | null> = {};
    for (const kind of TASK_KINDS) {
      const text = values[kind].trim();
      if (text && !(Number.isInteger(Number(text)) && Number(text) >= 1 && Number(text) <= 999)) {
        setError(`${TASK_KIND_LABEL[kind]}: use a whole number from 1 to 999, or leave it empty.`);
        return;
      }
      targets[kind] = text ? Number(text) : null;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/targets`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targets }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Could not save (${response.status}).`);
        return;
      }
      toast('Monthly targets saved.', 'success');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="targets-form" onSubmit={save}>
      <div className="targets-grid">
        {TASK_KINDS.map((kind) => (
          <label key={kind} className="field">
            <span>{TASK_KIND_LABEL[kind]}</span>
            <input
              type="number"
              min={1}
              max={999}
              inputMode="numeric"
              placeholder="—"
              value={values[kind]}
              autoComplete="off"
              onChange={(event) => setValues((current) => ({ ...current, [kind]: event.target.value }))}
            />
          </label>
        ))}
      </div>
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save targets'}
        </button>
        {error ? (
          <span className="error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </form>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { OPTIONAL_SECTIONS, SECTION_LABEL, type OptionalSection, type ReminderSettings } from '@/lib/domain/sections';
import { toast } from './resource-manager';

async function save(body: unknown): Promise<string | null> {
  const response = await fetch('/api/org-settings', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (response.ok) return null;
  const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return problem?.error?.message ?? `Could not save (${response.status}).`;
}

const REMINDERS: { key: Exclude<keyof ReminderSettings, 'shoot_days'>; label: string; hint: string }[] = [
  { key: 'due_tomorrow', label: 'Due tomorrow', hint: 'The assignee is reminded the day before a task is due.' },
  { key: 'missed', label: 'Missed deadlines', hint: 'Admins hear when a task or project passes its due date unfinished.' },
  { key: 'invoices', label: 'Overdue invoices', hint: 'Admins hear about unpaid invoices past their due date, weekly.' },
  { key: 'equipment_late', label: 'Equipment not returned', hint: 'The holder and admins hear when equipment is past its return date.' },
];

/** Which automatic reminders the daily job sends. */
export function ReminderSettingsForm({ initial }: { initial: ReminderSettings }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await save({ reminders: values });
    setBusy(false);
    if (problem) return setError(problem);
    toast('Reminders saved', 'success');
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="settings-toggles">
      {REMINDERS.map((item) => (
        <label key={item.key} className="toggle-row">
          <input type="checkbox" checked={values[item.key]} onChange={(event) => setValues({ ...values, [item.key]: event.target.checked })} />
          <span>
            <strong>{item.label}</strong>
            <small className="muted">{item.hint}</small>
          </span>
        </label>
      ))}
      <label className="field" style={{ maxWidth: 260 }}>
        <span>Unconfirmed shoot alert, days ahead</span>
        <input
          type="number"
          min={0}
          max={14}
          value={values.shoot_days}
          onChange={(event) => setValues({ ...values, shoot_days: Math.max(0, Math.min(14, Math.round(Number(event.target.value) || 0))) })}
        />
        <small className="muted">Admins hear when a shoot this close is still not confirmed. 0 turns it off.</small>
      </label>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save reminders'}
        </button>
      </div>
    </form>
  );
}

/** Optional menu sections a company does not use. */
export function SectionSettingsForm({ initial }: { initial: OptionalSection[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<OptionalSection>>(() => new Set(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const problem = await save({ hidden_sections: [...hidden] });
    setBusy(false);
    if (problem) return setError(problem);
    toast('Menu saved', 'success');
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="settings-toggles">
      {OPTIONAL_SECTIONS.map((section) => (
        <label key={section} className="toggle-row">
          <input
            type="checkbox"
            checked={!hidden.has(section)}
            onChange={(event) => {
              const next = new Set(hidden);
              if (event.target.checked) next.delete(section);
              else next.add(section);
              setHidden(next);
            }}
          />
          <span>
            <strong>{SECTION_LABEL[section]}</strong>
            <small className="muted">{hidden.has(section) ? 'Hidden from the menu for everyone.' : 'Shown in the menu.'}</small>
          </span>
        </label>
      ))}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save menu'}
        </button>
      </div>
    </form>
  );
}

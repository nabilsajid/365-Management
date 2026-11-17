'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { OPTIONAL_SECTIONS, SECTION_INFO, SECTION_LABEL, type OptionalSection, type ReminderSettings } from '@/lib/domain/sections';
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
  { key: 'email', label: 'Urgent alerts by email and WhatsApp', hint: 'Missed deadlines, unconfirmed shoots, late equipment and overdue invoices also go out by email (and WhatsApp, once set up), once a day.' },
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

/**
 * The company's optional features. Switching one off asks first: it changes the
 * menu for everyone, and can also delete that feature's data (after typing its name).
 */
export function FeatureSettings({ initial }: { initial: OptionalSection[] }) {
  const router = useRouter();
  const [hidden, setHidden] = useState<Set<OptionalSection>>(() => new Set(initial));
  const [asking, setAsking] = useState<OptionalSection | null>(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function change(feature: OptionalSection, on: boolean, deleteData = false) {
    setBusy(true);
    setError(null);
    const response = await fetch('/api/org-features', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature, on, delete_data: deleteData, confirm: typed }),
    });
    setBusy(false);
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return setError(problem?.error?.message ?? `Could not save (${response.status}).`);
    }
    const next = new Set(hidden);
    if (on) next.delete(feature);
    else next.add(feature);
    setHidden(next);
    setAsking(null);
    setTyped('');
    toast(on ? `${SECTION_LABEL[feature]} is on` : deleteData ? `${SECTION_LABEL[feature]} is off and its data was deleted` : `${SECTION_LABEL[feature]} is off`, 'success');
    startTransition(() => router.refresh());
  }

  return (
    <div className="settings-toggles">
      {OPTIONAL_SECTIONS.map((feature) => {
        const on = !hidden.has(feature);
        return (
          <div key={feature} className="toggle-row" style={{ cursor: 'default', flexWrap: 'wrap' }}>
            <span style={{ flex: 1, minWidth: 200 }}>
              <strong>
                {SECTION_LABEL[feature]} <span className={on ? 'badge badge-approved' : 'badge'}>{on ? 'On' : 'Off'}</span>
              </strong>
              <small className="muted">{SECTION_INFO[feature].about}</small>
            </span>
            {on ? (
              <button type="button" onClick={() => setAsking(feature)} disabled={busy}>
                Turn off
              </button>
            ) : (
              <button type="button" className="primary" onClick={() => change(feature, true)} disabled={busy}>
                Turn on
              </button>
            )}
            {asking === feature ? (
              <div className="feature-warning" role="alertdialog" aria-label={`Turn off ${SECTION_LABEL[feature]}`}>
                <p>
                  <strong>Turning off {SECTION_LABEL[feature]} changes the app for everyone.</strong> It disappears from the menu and
                  pages for the whole team.
                </p>
                {SECTION_INFO[feature].data ? (
                  <>
                    <p>
                      You can keep its data (switch it back on any time and everything is still there), or delete it.
                      Deleting removes {SECTION_INFO[feature].data} for good.
                    </p>
                    <label className="field" style={{ maxWidth: 320 }}>
                      <span>To delete the data, type {SECTION_LABEL[feature]}</span>
                      <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={SECTION_LABEL[feature]} />
                    </label>
                  </>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="primary" onClick={() => change(feature, false)} disabled={busy}>
                    {SECTION_INFO[feature].data ? 'Turn off, keep the data' : 'Turn off'}
                  </button>
                  {SECTION_INFO[feature].data ? (
                    <button
                      type="button"
                      className="danger"
                      disabled={busy || typed.trim().toLowerCase() !== SECTION_LABEL[feature].toLowerCase()}
                      onClick={() => change(feature, false, true)}
                    >
                      Turn off and delete the data
                    </button>
                  ) : null}
                  <button type="button" onClick={() => (setAsking(null), setTyped(''))} disabled={busy}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

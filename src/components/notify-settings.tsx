'use client';

import { useState } from 'react';
import { toast } from './resource-manager';

const KINDS = [
  { key: 'assignments', label: 'Assignments', help: 'A project or task is given to you.' },
  { key: 'updates', label: 'Updates', help: 'Announcements, broadcasts, personal messages and leave decisions.' },
  { key: 'approvals', label: 'Approvals', help: 'Something is waiting for you to approve.' },
  { key: 'money', label: 'Money', help: 'Invoices, payments, costs and payslips.' },
  { key: 'leave', label: 'Leave', help: 'Leave requests and decisions.' },
  { key: 'equipment', label: 'Equipment', help: 'Equipment requests, returns and late items.' },
] as const;
type Kind = (typeof KINDS)[number]['key'];

/** Lets a person choose which kinds of notification they get, in the app and on their devices. */
export function NotifySettings({ initial }: { initial: Partial<Record<Kind, boolean>>; isAdmin?: boolean }) {
  const [prefs, setPrefs] = useState<Record<Kind, boolean>>({
    assignments: initial.assignments !== false,
    updates: initial.updates !== false,
    approvals: initial.approvals !== false,
    money: initial.money !== false,
    leave: initial.leave !== false,
    equipment: initial.equipment !== false,
  });
  const [busy, setBusy] = useState(false);

  async function change(kind: Kind, on: boolean) {
    const next = { ...prefs, [kind]: on };
    setPrefs(next);
    setBusy(true);
    try {
      const response = await fetch('/api/profile/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) {
        setPrefs(prefs);
        toast('That setting could not be saved. Please try again.');
        return;
      }
      toast(on ? 'Turned on' : 'Turned off', 'success');
    } catch {
      setPrefs(prefs);
      toast('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Notifications</h2>
          <p className="muted">
            Choose what you are told about, in the app and on your devices. Turned-off kinds are still listed where they belong.
          </p>
        </div>
      </header>
      <ul className="check-list">
        {KINDS.map((kind) => (
          <li key={kind.key}>
            <span>
              <strong>{kind.label}</strong>
              <span className="muted">{kind.help}</span>
            </span>
            <label className="switch-label">
              <input type="checkbox" checked={prefs[kind.key]} disabled={busy} onChange={(event) => change(kind.key, event.target.checked)} />
              {prefs[kind.key] ? 'On' : 'Off'}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

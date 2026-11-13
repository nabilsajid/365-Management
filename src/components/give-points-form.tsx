'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { POINT_REASONS, pointReason } from '@/lib/domain/points';
import { toast } from './resource-manager';
import type { Option } from './types';

/**
 * Give points to an employee for any reason. An admin's points count at once;
 * anyone else's are sent to an admin for approval.
 */
export function GivePointsForm({ people, month, needsApproval }: { people: Option[]; month: string; needsApproval: boolean }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState('');
  const [preset, setPreset] = useState<string>(POINT_REASONS[0]);
  const [points, setPoints] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const amount = Number(points);
    const reason = pointReason(preset, details);
    if (!employeeId) return setError('Choose an employee.');
    if (!Number.isInteger(amount) || amount <= 0) return setError('Enter a whole number of points above zero.');
    if (!reason) return setError('Write the reason.');

    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'adjustment', employee_id: employeeId, points: amount, reason, month }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      const name = people.find((person) => person.value === employeeId)?.label ?? 'them';
      if (response.status === 202) toast('Sent to an admin for approval.');
      else toast(`${amount.toLocaleString('en-US')} points given to ${name}`, 'success');
      setPoints('');
      setDetails('');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Give points</h2>
          <p className="muted">
            Reward anyone for anything: extra time, a new client, good feedback.
            {needsApproval ? ' Your points count once an admin approves them.' : ' They count straight away.'}
          </p>
        </div>
      </header>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label className="field">
            <span>Employee *</span>
            <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Choose…</option>
              {people.map((person) => (
                <option key={person.value} value={person.value}>
                  {person.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Reason *</span>
            <select value={preset} onChange={(event) => setPreset(event.target.value)}>
              {POINT_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Points *</span>
            <input type="number" min={1} step={1} inputMode="numeric" value={points} placeholder="100" onChange={(event) => setPoints(event.target.value)} />
          </label>
          <label className="field wide">
            <span>{preset === 'Other' ? 'Reason in your words *' : 'Details (optional)'}</span>
            <input value={details} placeholder={preset === 'Other' ? 'What is this for?' : 'Anything worth noting'} onChange={(event) => setDetails(event.target.value)} />
          </label>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : needsApproval ? 'Send for approval' : 'Give points'}
          </button>
        </div>
      </form>
    </section>
  );
}

'use client';

import { Eye, EyeOff, Shuffle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '@/lib/validation';
import { toast } from './resource-manager';
import type { Option } from './types';

// Letters and digits that are hard to mix up when read aloud or typed (no 0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';

function randomPassword(length = 10): string {
  const picks = new Uint32Array(length);
  window.crypto.getRandomValues(picks);
  return Array.from(picks, (pick) => ALPHABET[pick % ALPHABET.length]).join('');
}

/** Admin only: give one person a new password, typed or generated. */
export function SetPassword({ people }: { people: Option[] }) {
  const [personId, setPersonId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaved(null);
    if (!personId) {
      setError('Choose a person.');
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/employees/${personId}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      const name = people.find((person) => person.value === personId)?.label ?? 'them';
      toast(`New password set for ${name}`, 'success');
      setSaved(`Done. Share the new password with ${name} now; it cannot be shown again after you leave this page.`);
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
          <h2>Passwords</h2>
          <p className="muted">
            Give each person their own password. Passwords are stored encrypted, so nobody can read an existing one; you
            can only replace it.
          </p>
        </div>
      </header>
      <form className="form" onSubmit={save}>
        <div className="form-grid">
          <label className="field">
            <span>Person *</span>
            <select
              value={personId}
              onChange={(event) => {
                setPersonId(event.target.value);
                setPassword('');
                setSaved(null);
                setError(null);
              }}
            >
              <option value="">Choose…</option>
              {people.map((person) => (
                <option key={person.value} value={person.value}>
                  {person.label}
                </option>
              ))}
            </select>
          </label>
          <div className="field">
            <span>New password *</span>
            <div className="password-set">
              <span className="password-box">
                <input
                  type={show ? 'text' : 'password'}
                  value={password}
                  aria-label="New password"
                  autoComplete="new-password"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setSaved(null);
                  }}
                />
                <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((value) => !value)}>
                  {show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                </button>
              </span>
              <button
                type="button"
                onClick={() => {
                  setPassword(randomPassword());
                  setShow(true);
                  setSaved(null);
                }}
              >
                <Shuffle size={14} aria-hidden style={{ marginRight: 6 }} />
                Generate
              </button>
            </div>
          </div>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        {saved ? (
          <p className="muted" role="status">
            {saved}
          </p>
        ) : null}
        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </div>
      </form>
    </section>
  );
}

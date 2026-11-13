'use client';

import { Copy, Eye, EyeOff, Shuffle } from 'lucide-react';
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

export interface LoginRow {
  id: string;
  name: string;
  role: string | null;
  /** The email the person signs in with. */
  loginId: string | null;
  isAdmin: boolean;
}

/** One person's sign-in email and, on request, the password an admin gave them. */
function LoginLine({ row, version }: { row: LoginRow; version: number }) {
  // undefined: hidden. null: nothing on record. Otherwise the password.
  const [password, setPassword] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [seen, setSeen] = useState(version);
  // A new password was just set for this person: hide the old one.
  if (seen !== version) {
    setSeen(version);
    setPassword(undefined);
  }

  async function reveal() {
    setBusy(true);
    try {
      const response = await fetch(`/api/employees/${row.id}/password`);
      const result = (await response.json().catch(() => null)) as { data?: { password?: string | null } } | null;
      setPassword(response.ok ? (result?.data?.password ?? null) : null);
    } catch {
      toast('Could not reach the server.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`, 'success');
    } catch {
      toast('Copying is not available here.');
    }
  }

  return (
    <tr>
      <td>
        {row.name}
        {row.role ? <span className="muted"> · {row.role}</span> : null}
      </td>
      <td>
        {row.loginId ? (
          <span className="login-value">
            {row.loginId}
            <button type="button" className="mini" aria-label={`Copy login ID of ${row.name}`} onClick={() => copy(row.loginId ?? '', 'Login ID')}>
              <Copy size={13} aria-hidden />
            </button>
          </span>
        ) : (
          '—'
        )}
      </td>
      <td>
        {row.isAdmin ? (
          <span className="muted">Not kept for admins</span>
        ) : password === undefined ? (
          <span className="login-value">
            <span aria-hidden>••••••••</span>
            <button type="button" className="mini" disabled={busy} onClick={reveal}>
              <Eye size={13} aria-hidden style={{ marginRight: 5 }} />
              {busy ? 'Loading…' : 'Show'}
            </button>
          </span>
        ) : password === null ? (
          <span className="muted">Not on record. Set a new password below.</span>
        ) : (
          <span className="login-value">
            <code>{password}</code>
            <button type="button" className="mini" aria-label={`Copy password of ${row.name}`} onClick={() => copy(password, 'Password')}>
              <Copy size={13} aria-hidden />
            </button>
            <button type="button" className="mini" onClick={() => setPassword(undefined)}>
              <EyeOff size={13} aria-hidden style={{ marginRight: 5 }} />
              Hide
            </button>
          </span>
        )}
      </td>
    </tr>
  );
}

/** Admin only: everyone's login details, and a form to give one person a new password. */
export function SetPassword({ people, logins }: { people: Option[]; logins: LoginRow[] }) {
  const [versions, setVersions] = useState<Record<string, number>>({});
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
      setVersions((current) => ({ ...current, [personId]: (current[personId] ?? 0) + 1 }));
      setSaved(`Done. Share the new password with ${name}. You can look it up again in the list above.`);
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
          <h2>Login details</h2>
          <p className="muted">
            Only admins see this. The login ID is the email a person signs in with. A password can be shown once it has
            been set here or under Approvals; passwords from before that are not on record.
          </p>
        </div>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Login ID</th>
              <th>Password</th>
            </tr>
          </thead>
          <tbody>
            {logins.map((row) => (
              <LoginLine key={row.id} row={row} version={versions[row.id] ?? 0} />
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="login-subhead">Set a new password</h3>
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

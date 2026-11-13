'use client';

import { Copy, Eye, EyeOff, Shuffle, Wand2 } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
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

interface Record_ {
  ready: boolean;
  passwords: Record<string, string>;
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`, 'success');
  } catch {
    toast('Copying is not available here.');
  }
}

async function readError(response: Response): Promise<string> {
  const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return problem?.error?.message ?? `Request failed (${response.status}).`;
}

/** Admin only: everyone's login ID and password, and ways to give people new passwords. */
export function SetPassword({ people, logins }: { people: Option[]; logins: LoginRow[] }) {
  // null while loading. Passwords are fetched when this tab opens, not sent with other pages.
  const [record, setRecord] = useState<Record_ | null>(null);
  const [hidden, setHidden] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [filling, setFilling] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [personId, setPersonId] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/employees/passwords')
      .then(async (response) => {
        if (!response.ok) throw new Error(await readError(response));
        return ((await response.json()) as { data: Record_ }).data;
      })
      .then((data) => !cancelled && setRecord(data))
      .catch((problem: Error) => {
        if (cancelled) return;
        setRecord({ ready: true, passwords: {} });
        setListError(problem.message || 'The passwords could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const employees = logins.filter((row) => !row.isAdmin);
  const missing = record ? employees.filter((row) => !(row.id in record.passwords)).length : 0;

  async function fillMissing() {
    setFilling(true);
    setListError(null);
    try {
      const response = await fetch('/api/employees/passwords', { method: 'POST' });
      if (!response.ok) {
        setListError(await readError(response));
        return;
      }
      const { data } = (await response.json()) as { data: Record_ & { changed: number } };
      setRecord({ ready: data.ready, passwords: data.passwords });
      setHidden(false);
      toast(`New passwords set for ${data.changed} ${data.changed === 1 ? 'person' : 'people'}`, 'success');
    } catch {
      setListError('Could not reach the server. Check your connection and try again.');
    } finally {
      setFilling(false);
      setConfirming(false);
    }
  }

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
        setError(await readError(response));
        return;
      }
      const row = logins.find((item) => item.id === personId);
      const name = row?.name ?? 'them';
      toast(`New password set for ${name}`, 'success');
      if (row && !row.isAdmin && record?.ready) {
        setRecord({ ready: true, passwords: { ...record.passwords, [personId]: password } });
      }
      setSaved(`Done. Share the new password with ${name}.`);
      setPassword('');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Login details</h2>
            <p className="muted">
              Only admins see this. The login ID is the email a person signs in with. The password is the one an admin
              gave them here.
            </p>
          </div>
          {record?.ready ? (
            <button type="button" onClick={() => setHidden((value) => !value)}>
              {hidden ? <Eye size={14} aria-hidden style={{ marginRight: 6 }} /> : <EyeOff size={14} aria-hidden style={{ marginRight: 6 }} />}
              {hidden ? 'Show passwords' : 'Hide passwords'}
            </button>
          ) : null}
        </header>

        {record && !record.ready ? (
          <p className="error" role="alert">
            Passwords cannot be shown yet. Run the file <code>20261112000014_login_details.sql</code> in the Supabase SQL
            Editor, make sure SUPABASE_SERVICE_ROLE_KEY is set in Vercel, then reload this page.
          </p>
        ) : null}

        {record?.ready && missing > 0 ? (
          <div className="login-fill">
            <p>
              <strong>
                {missing} {missing === 1 ? 'person has' : 'people have'} no password on record.
              </strong>{' '}
              Passwords that were set before this list existed cannot be read back. You can give each of them a new,
              different password in one step; it will show here straight away.
            </p>
            {confirming ? (
              <div className="actions">
                <span className="muted">Their old password stops working at once. Continue?</span>
                <button type="button" className="primary" disabled={filling} onClick={fillMissing}>
                  {filling ? 'Working…' : 'Yes, set new passwords'}
                </button>
                <button type="button" disabled={filling} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className="actions">
                <button type="button" className="primary" onClick={() => setConfirming(true)}>
                  <Wand2 size={14} aria-hidden style={{ marginRight: 6 }} />
                  Give them new passwords
                </button>
              </div>
            )}
          </div>
        ) : null}

        {listError ? (
          <p className="error" role="alert">
            {listError}
          </p>
        ) : null}

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
              {logins.map((row) => {
                const known = record?.passwords[row.id];
                return (
                  <tr key={row.id}>
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
                      ) : !record ? (
                        <span className="muted">Loading…</span>
                      ) : known === undefined ? (
                        <span className="muted">Not on record</span>
                      ) : hidden ? (
                        <span aria-label="Hidden">••••••••</span>
                      ) : (
                        <span className="login-value">
                          <code>{known}</code>
                          <button type="button" className="mini" aria-label={`Copy password of ${row.name}`} onClick={() => copy(known, 'Password')}>
                            <Copy size={13} aria-hidden />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Set a new password</h2>
            <p className="muted">Replace one person’s password, typed or generated.</p>
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
    </>
  );
}

'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from './resource-manager';

export interface PasswordRequestRow {
  id: string;
  name: string;
  role: string | null;
  email: string;
  sent: string;
}

function Row({ row }: { row: PasswordRequestRow }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function resolve(action: 'set' | 'dismiss') {
    if (action === 'set' && password.length < 6) {
      setError('Use at least 6 characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/password-requests/${row.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'set' ? { action, password } : { action }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      if (action === 'set') toast(`New password set for ${row.name}`, 'success');
      else toast('Request dismissed.');
      setPassword('');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr>
      <td>{row.sent}</td>
      <td>
        {row.name}
        {row.role ? <span className="muted"> · {row.role}</span> : null}
      </td>
      <td>{row.email}</td>
      <td>
        <div className="password-set">
          <span className="password-box">
            <input
              type={show ? 'text' : 'password'}
              value={password}
              placeholder="New password"
              aria-label={`New password for ${row.name}`}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
            />
            <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((value) => !value)}>
              {show ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
          </span>
          <button type="button" className="primary" disabled={busy} onClick={() => resolve('set')}>
            Set password
          </button>
          <button type="button" disabled={busy} onClick={() => resolve('dismiss')}>
            Dismiss
          </button>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
      </td>
    </tr>
  );
}

/** Forgotten-password requests waiting for the admin. */
export function PasswordRequests({ rows }: { rows: PasswordRequestRow[] }) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>
            Password requests
            {rows.length > 0 ? <span className="count">{rows.length}</span> : null}
          </h2>
          <p className="muted">
            People who forgot their password. Set a new one and tell them what it is, or dismiss the request.
          </p>
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="muted empty">No password requests.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Asked</th>
                <th>Person</th>
                <th>Email</th>
                <th>New password</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} row={row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

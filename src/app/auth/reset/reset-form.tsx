'use client';

import { Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, type FormEvent } from 'react';
import { PASSWORD_MIN } from '@/lib/validation';

type Stage = 'checking' | 'ready' | 'invalid' | 'done';

export function ResetForm() {
  const [stage, setStage] = useState<Stage>('checking');
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The email link arrives with its token after the # in the address. It is
  // kept in memory and removed from the address bar straight away.
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const found = params.get('access_token');
    if (found && !params.get('error')) {
      setToken(found);
      setStage('ready');
    } else {
      setStage('invalid');
    }
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (password.length < PASSWORD_MIN) {
      setError(`Use at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== again) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token, password }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? 'The password could not be changed. Please try again.');
        return;
      }
      setStage('done');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (stage === 'checking') return <p className="muted">Checking your link…</p>;

  if (stage === 'invalid') {
    return (
      <div className="form">
        <h1>This link no longer works</h1>
        <p className="muted">Reset links expire and can be used once. Go back to sign in and choose “Forgot password?” to get a new one.</p>
        <Link href="/login">Back to sign in</Link>
      </div>
    );
  }

  if (stage === 'done') {
    return (
      <div className="form">
        <h1>Password changed</h1>
        <p className="muted">You can now sign in with your new password.</p>
        <Link href="/login">Go to sign in</Link>
      </div>
    );
  }

  return (
    <form className="form" onSubmit={save}>
      <div>
        <h1>Choose a new password</h1>
        <p className="muted">At least {PASSWORD_MIN} characters.</p>
      </div>
      <label className="field wide">
        <span>New password</span>
        <span className="password-box">
          <input type={show ? 'text' : 'password'} autoComplete="new-password" required autoFocus value={password} onChange={(event) => setPassword(event.target.value)} />
          <button type="button" className="eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => setShow((value) => !value)}>
            {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </span>
      </label>
      <label className="field wide">
        <span>Type it again</span>
        <span className="password-box">
          <input type={show ? 'text' : 'password'} autoComplete="new-password" required value={again} onChange={(event) => setAgain(event.target.value)} />
        </span>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save new password'}
      </button>
    </form>
  );
}

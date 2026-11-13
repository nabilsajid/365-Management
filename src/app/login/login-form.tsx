'use client';

import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function LoginForm({ notice }: { notice?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'forgot' | 'sent'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: problem } = await createClient().auth.signInWithPassword({ email, password });
    if (problem) {
      setBusy(false);
      setError(problem.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function askAdmin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/password-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? 'The request could not be sent. Please try again.');
        return;
      }
      setMode('sent');
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  function switchTo(next: 'signin' | 'forgot') {
    setError(null);
    setMode(next);
  }

  if (mode === 'sent') {
    return (
      <div className="form">
        <h1>Request sent</h1>
        <p className="muted">
          If <strong>{email}</strong> belongs to an account, your admin has been notified. They will set a new password and
          share it with you. If it is an admin account, a verification email with a reset link is on its way to that
          address instead.
        </p>
        <button type="button" className="primary" onClick={() => switchTo('signin')}>
          Back to sign in
        </button>
      </div>
    );
  }

  if (mode === 'forgot') {
    return (
      <form className="form" onSubmit={askAdmin}>
        <div>
          <h1>Forgot your password?</h1>
          <p className="muted">Enter your email and your admin will be asked to set a new password for you. Admins get a verification email instead.</p>
        </div>
        <label className="field wide">
          <span>Email</span>
          <input type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Sending…' : 'Send request'}
        </button>
        <button type="button" className="link" onClick={() => switchTo('signin')}>
          <ArrowLeft size={14} aria-hidden /> Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form className="form" onSubmit={signIn}>
      <div>
        <h1>Sign in</h1>
        <p className="muted">Use the email and password your admin set up for you.</p>
      </div>
      {notice ? <p className="muted">{notice}</p> : null}
      <label className="field wide">
        <span>Email</span>
        <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      <label className="field wide">
        <span>Password</span>
        <span className="password-box">
          <input
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button
            type="button"
            className="eye"
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            onClick={() => setShow((value) => !value)}
          >
            {show ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
          </button>
        </span>
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="primary" disabled={busy}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <button type="button" className="link" onClick={() => switchTo('forgot')}>
        Forgot password?
      </button>
    </form>
  );
}

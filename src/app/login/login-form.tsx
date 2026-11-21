'use client';

import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/browser';

export function LoginForm({ notice, needsCode = false }: { notice?: string; needsCode?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'forgot' | 'sent' | 'code'>(needsCode ? 'code' : 'signin');
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arriving here signed out: pages saved for offline use belonged to whoever
  // was signed in before, so they are removed from this device.
  useEffect(() => {
    if (navigator.onLine && 'caches' in window) void caches.delete('pages-v1').catch(() => false);
  }, []);

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
    // Two-step sign-in turned on: ask for the code from the authenticator app.
    const level = await createClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (level.data?.nextLevel === 'aal2' && level.data.currentLevel !== 'aal2') {
      setBusy(false);
      setMode('code');
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function checkCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const factors = await supabase.auth.mfa.listFactors();
    const factor = factors.data?.totp.find((item) => item.status === 'verified');
    if (!factor) {
      setBusy(false);
      setError('Two-step sign-in is not set up on this account. Sign in again.');
      return;
    }
    const { error: problem } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: code.trim() });
    if (problem) {
      setBusy(false);
      setError('That code did not work. Check the time on your phone and try the newest code.');
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function startOver() {
    await createClient().auth.signOut();
    setCode('');
    setPassword('');
    switchTo('signin');
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

  function switchTo(next: 'signin' | 'forgot' | 'code') {
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

  if (mode === 'code') {
    return (
      <form className="form" onSubmit={checkCode}>
        <div>
          <h1>Enter your code</h1>
          <p className="muted">Open your authenticator app and type the 6-digit code shown for UniDock.</p>
        </div>
        <label className="field wide">
          <span>Code</span>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
        </label>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" className="primary" disabled={busy || code.length !== 6}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <button type="button" className="link" onClick={() => void startOver()}>
          <ArrowLeft size={14} aria-hidden /> Use another account
        </button>
      </form>
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

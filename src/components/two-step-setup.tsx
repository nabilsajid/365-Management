'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from '@/components/resource-manager';
import { createClient } from '@/lib/supabase/browser';

type State =
  | { kind: 'loading' }
  | { kind: 'off' }
  | { kind: 'setup'; factorId: string; qr: string; key: string }
  | { kind: 'on'; factorId: string; since: string };

/**
 * Two-step sign-in for the person signed in: after the password, a 6-digit code
 * from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
 */
export function TwoStepSetup() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: problem } = await createClient().auth.mfa.listFactors();
    if (problem) {
      setError(problem.message);
      setState({ kind: 'off' });
      return;
    }
    const verified = data.totp.find((item) => item.status === 'verified');
    setState(verified ? { kind: 'on', factorId: verified.id, since: verified.created_at } : { kind: 'off' });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    // A set-up that was started earlier and never finished is cleared first.
    const { data: existing } = await supabase.auth.mfa.listFactors();
    for (const factor of existing?.all ?? []) {
      if (factor.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error: problem } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `UniDock ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (problem || !data) {
      setError(problem?.message ?? 'Two-step sign-in could not be started. Check that it is allowed in Supabase (Authentication → Multi-factor).');
      return;
    }
    setState({ kind: 'setup', factorId: data.id, qr: data.totp.qr_code, key: data.totp.secret });
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (state.kind !== 'setup') return;
    setBusy(true);
    setError(null);
    const { error: problem } = await createClient().auth.mfa.challengeAndVerify({ factorId: state.factorId, code: code.trim() });
    setBusy(false);
    if (problem) {
      setError('That code did not work. Check the time on your phone and try the newest code.');
      return;
    }
    setCode('');
    toast('Two-step sign-in is on.');
    await load();
  }

  async function turnOff() {
    if (state.kind !== 'on') return;
    if (!window.confirm('Turn off two-step sign-in? Only your password will be asked for.')) return;
    setBusy(true);
    setError(null);
    const { error: problem } = await createClient().auth.mfa.unenroll({ factorId: state.factorId });
    setBusy(false);
    if (problem) {
      setError(problem.message);
      return;
    }
    toast('Two-step sign-in is off.');
    await load();
  }

  return (
    <div className="form">
      {state.kind === 'loading' ? <p className="muted">Checking…</p> : null}
      {state.kind === 'on' ? (
        <>
          <p>
            <span className="badge badge-approved">On</span> Since {new Date(state.since).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
            Each sign-in asks for the code from your authenticator app.
          </p>
          <div>
            <button type="button" onClick={() => void turnOff()} disabled={busy}>
              Turn off
            </button>
          </div>
        </>
      ) : null}
      {state.kind === 'off' ? (
        <>
          <p className="muted">
            Off. Turn it on and, after your password, sign-in also asks for a 6-digit code from an app on your phone, so a stolen
            password alone cannot open the admin account.
          </p>
          <div>
            <button type="button" className="primary" onClick={() => void start()} disabled={busy}>
              {busy ? 'Starting…' : 'Turn on two-step sign-in'}
            </button>
          </div>
        </>
      ) : null}
      {state.kind === 'setup' ? (
        <form className="form" onSubmit={confirm}>
          <p>1. In Google Authenticator, Microsoft Authenticator or 1Password, add an account and scan this code.</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={state.qr} alt="Code to scan with your authenticator app" width={180} height={180} style={{ background: '#fff', padding: 8, borderRadius: 8 }} />
          <details>
            <summary>Can&apos;t scan? Type a setup key instead</summary>
            <p className="muted">
              Only on your own phone: <code style={{ userSelect: 'all', wordBreak: 'break-all' }}>{state.key}</code>
            </p>
          </details>
          <label className="field">
            <span>2. Enter the 6-digit code the app shows</span>
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            />
          </label>
          <div className="row-actions">
            <button type="submit" className="primary" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Turn on'}
            </button>
            <button type="button" onClick={() => void load()} disabled={busy}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

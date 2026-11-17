'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { toast } from './resource-manager';

type Saved = { provider: string; username: string; from_name: string | null; host: string; port: number } | null;

/**
 * Admin: the email address all alerts come from, e.g. a Gmail with an App
 * password. Saving sends you a test email first; the password is stored
 * encrypted and never shown again.
 */
export function MailSettingsForm({ saved }: { saved: Saved }) {
  const router = useRouter();
  const [values, setValues] = useState({
    provider: saved?.provider ?? 'gmail',
    email: saved?.username ?? '',
    app_password: '',
    from_name: saved?.from_name ?? '',
    host: saved?.provider === 'custom' ? saved.host : '',
    port: String(saved?.port ?? 465),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/mail-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...values, port: Number(values.port) }),
    });
    setBusy(false);
    const result = (await response.json().catch(() => null)) as { data?: { testSentTo: string }; error?: { message?: string } } | null;
    if (!response.ok) return setError(result?.error?.message ?? `Could not save (${response.status}).`);
    setValues((current) => ({ ...current, app_password: '' }));
    toast(`Connected. A test email went to ${result?.data?.testSentTo}.`, 'success');
    startTransition(() => router.refresh());
  }

  async function remove() {
    setBusy(true);
    const response = await fetch('/api/mail-settings', { method: 'DELETE' });
    setBusy(false);
    if (!response.ok) return setError('Could not remove it.');
    toast('Email account removed');
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={submit} className="form-grid">
      <label className="field">
        <span>Email service</span>
        <select value={values.provider} onChange={(event) => setValues({ ...values, provider: event.target.value })}>
          <option value="gmail">Gmail</option>
          <option value="outlook">Outlook / Hotmail / Microsoft 365</option>
          <option value="custom">Other (enter the mail server)</option>
        </select>
      </label>
      <label className="field">
        <span>Send alerts from (email address) *</span>
        <input type="email" required value={values.email} placeholder="alerts.365frames@gmail.com" onChange={(event) => setValues({ ...values, email: event.target.value })} />
      </label>
      <label className="field">
        <span>App password {saved ? '' : '*'}</span>
        <input
          type="password"
          autoComplete="new-password"
          value={values.app_password}
          placeholder={saved ? 'Saved. Leave empty to keep it' : '16 letters from Google'}
          required={!saved}
          onChange={(event) => setValues({ ...values, app_password: event.target.value })}
        />
        <small className="muted">
          {values.provider === 'gmail'
            ? 'Not your normal password: in your Google Account, turn on 2-Step Verification, then search "App passwords" and create one for UniDock.'
            : 'Use an app password if your email service offers one.'}
        </small>
      </label>
      <label className="field">
        <span>Sender name (optional)</span>
        <input value={values.from_name} placeholder="365 Frames Alerts" onChange={(event) => setValues({ ...values, from_name: event.target.value })} />
      </label>
      {values.provider === 'custom' ? (
        <>
          <label className="field">
            <span>Mail server (SMTP)</span>
            <input value={values.host} placeholder="smtp.example.com" onChange={(event) => setValues({ ...values, host: event.target.value })} />
          </label>
          <label className="field">
            <span>Port</span>
            <select value={values.port} onChange={(event) => setValues({ ...values, port: event.target.value })}>
              <option value="465">465 (SSL)</option>
              <option value="587">587 (STARTTLS)</option>
            </select>
          </label>
        </>
      ) : null}
      {error ? (
        <p className="error wide" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions wide" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Checking and saving…' : saved ? 'Save and send a test' : 'Connect and send a test'}
        </button>
        {saved ? (
          <button type="button" className="danger" onClick={remove} disabled={busy}>
            Remove
          </button>
        ) : null}
      </div>
    </form>
  );
}

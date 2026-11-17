'use client';

import { useState } from 'react';

/** Sends a test alert email to the admin pressing it, and says what happened. */
export function TestAlertButton() {
  const [state, setState] = useState<{ busy: boolean; message: string | null; ok: boolean }>({ busy: false, message: null, ok: false });

  async function send() {
    setState({ busy: true, message: null, ok: false });
    const response = await fetch('/api/alerts/test', { method: 'POST' });
    const result = (await response.json().catch(() => null)) as { data?: { sentTo: string }; error?: { message?: string } } | null;
    setState(
      response.ok
        ? { busy: false, ok: true, message: `Sent to ${result?.data?.sentTo}. Check your inbox (and spam).` }
        : { busy: false, ok: false, message: result?.error?.message ?? `Could not send (${response.status}).` },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={send} disabled={state.busy}>
        {state.busy ? 'Sending…' : 'Send me a test email'}
      </button>
      {state.message ? (
        <span className={state.ok ? 'text-success-strong' : 'error'} role="status">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

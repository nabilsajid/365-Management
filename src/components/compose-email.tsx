'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { toast } from './resource-manager';

/** Write a custom email: pick people (or everyone), add any addresses, then send now or keep it for approval. */
export function ComposeEmail({ people }: { people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [everyone, setEveryone] = useState(false);
  const [addresses, setAddresses] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function submit(sendNow: boolean, event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_ids: [...chosen],
        everyone,
        addresses: addresses
          .split(/[\s,;]+/)
          .map((item) => item.trim())
          .filter(Boolean),
        subject,
        body,
        send_now: sendNow,
      }),
    });
    setBusy(false);
    const result = (await response.json().catch(() => null)) as { data?: { recipients: number; sent: number; failed: number }; error?: { message?: string } } | null;
    if (!response.ok || !result?.data) return setError(result?.error?.message ?? `Could not do that (${response.status}).`);
    const { recipients, sent, failed } = result.data;
    toast(
      sendNow
        ? failed > 0
          ? `Sent ${sent} of ${recipients}; ${failed} failed (see the list below).`
          : `Sent to ${recipients} ${recipients === 1 ? 'person' : 'people'}.`
        : `Saved for approval: ${recipients} ${recipients === 1 ? 'email' : 'emails'}.`,
      failed > 0 ? undefined : 'success',
    );
    setChosen(new Set());
    setEveryone(false);
    setAddresses('');
    setSubject('');
    setBody('');
    startTransition(() => router.refresh());
  }

  return (
    <form onSubmit={(event) => submit(true, event)} className="email-draft">
      <div className="field">
        <span>To</span>
        <label className="choice">
          <input type="checkbox" checked={everyone} onChange={(event) => setEveryone(event.target.checked)} />
          Everyone in the team
        </label>
        {!everyone ? (
          <div className="compose-people">
            {people.map((person) => (
              <label key={person.id} className="choice">
                <input
                  type="checkbox"
                  checked={chosen.has(person.id)}
                  onChange={(event) => {
                    const next = new Set(chosen);
                    if (event.target.checked) next.add(person.id);
                    else next.delete(person.id);
                    setChosen(next);
                  }}
                />
                {person.name}
              </label>
            ))}
          </div>
        ) : null}
      </div>
      <label className="field">
        <span>Other email addresses (optional, e.g. a client)</span>
        <input value={addresses} placeholder="client@example.com, another@example.com" onChange={(event) => setAddresses(event.target.value)} />
      </label>
      <label className="field">
        <span>Subject *</span>
        <input value={subject} maxLength={200} required onChange={(event) => setSubject(event.target.value)} />
      </label>
      <label className="field">
        <span>Message *</span>
        <textarea rows={8} value={body} required onChange={(event) => setBody(event.target.value)} />
      </label>
      <small className="muted">Each person gets their own email; nobody sees the others&apos; addresses.</small>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Working…' : 'Send now'}
        </button>
        <button type="button" onClick={() => submit(false)} disabled={busy}>
          Save for approval
        </button>
      </div>
    </form>
  );
}

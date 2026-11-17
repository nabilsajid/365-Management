'use client';

import { ArrowRightLeft, Building2, Undo2 } from 'lucide-react';
import { useState } from 'react';

async function switchTo(orgId: string | null): Promise<string | null> {
  try {
    const response = await fetch('/api/companies/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_id: orgId }),
    });
    if (response.ok) return null;
    const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return problem?.error?.message ?? `Request failed (${response.status}).`;
  } catch {
    return 'Could not reach the server. Check your connection and try again.';
  }
}

/** On Companies: open a company (as its admin), or go back to your own. */
export function OpenCompanyButton({ orgId, home, label }: { orgId: string; home: boolean; label: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function open() {
    setBusy(true);
    const problem = await switchTo(home ? null : orgId);
    if (problem) {
      setError(problem);
      setBusy(false);
      return;
    }
    // A full reload, so every page, the sidebar and the data belong to that company.
    window.location.assign('/dashboard');
  }
  return (
    <span className="action">
      <button type="button" className="primary" onClick={open} disabled={busy}>
        <ArrowRightLeft size={14} aria-hidden style={{ marginRight: 6 }} />
        {busy ? 'Opening…' : label}
      </button>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

/** Shown at the top while the owner is inside another company. */
export function CompanyViewBar({ orgName }: { orgName: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function back() {
    setBusy(true);
    const problem = await switchTo(null);
    if (problem) {
      setError(problem);
      setBusy(false);
      return;
    }
    window.location.assign('/companies');
  }
  return (
    <div className="preview-bar company-bar" role="status">
      <span>
        <Building2 size={15} aria-hidden />
        You are inside <strong>{orgName}</strong> as its admin. Everything here is that company&apos;s real data.
        {error ? ` ${error}` : ''}
      </span>
      <button type="button" disabled={busy} onClick={back}>
        <Undo2 size={14} aria-hidden />
        {busy ? 'Switching…' : 'Switch company'}
      </button>
    </div>
  );
}

/** On Companies (owner): delete a customer company after typing its name. */
export function DeleteCompanyButton({ orgId, name }: { orgId: string; name: string }) {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const response = await fetch(`/api/companies/${orgId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: typed }),
    });
    setBusy(false);
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return setError(problem?.error?.message ?? `Could not delete (${response.status}).`);
    }
    window.location.reload();
  }

  if (!asking) {
    return (
      <button type="button" className="danger" onClick={() => setAsking(true)}>
        Delete company
      </button>
    );
  }
  return (
    <div className="feature-warning" role="alertdialog" aria-label={`Delete ${name}`}>
      <p>
        <strong>This deletes {name} for good:</strong> its people and their logins, projects, tasks, invoices, money records
        and everything else. It cannot be undone.
      </p>
      <label className="field">
        <span>Type {name} to confirm</span>
        <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder={name} />
      </label>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="danger" disabled={busy || typed.trim().toLowerCase() !== name.trim().toLowerCase()} onClick={remove}>
          {busy ? 'Deleting…' : 'Delete for good'}
        </button>
        <button type="button" onClick={() => (setAsking(false), setTyped(''))} disabled={busy}>
          Cancel
        </button>
      </div>
    </div>
  );
}

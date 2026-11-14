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
        {busy ? 'Switching back…' : 'Back to my company'}
      </button>
    </div>
  );
}

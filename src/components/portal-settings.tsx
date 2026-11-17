'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from './resource-manager';

/**
 * A client portal's invoice switches: invoices stay hidden from the client
 * until turned on, and drafts only when that is turned on too. "Preview" opens
 * the portal exactly as the client sees it.
 */
export function PortalSettings({ clientId, token, showInvoices, showDrafts }: { clientId: string; token: string; showInvoices: boolean; showDrafts: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState({ show_invoices: showInvoices, show_drafts: showDrafts });
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function change(key: 'show_invoices' | 'show_drafts', on: boolean) {
    const next = { ...values, [key]: on, ...(key === 'show_invoices' && !on ? { show_drafts: false } : {}) };
    setBusy(true);
    const response = await fetch(`/api/clients/${clientId}/portal`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    setBusy(false);
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      toast(problem?.error?.message ?? 'Could not save.');
      return;
    }
    setValues(next);
    startTransition(() => router.refresh());
  }

  return (
    <div className="portal-settings">
      <label className="choice">
        <input type="checkbox" checked={values.show_invoices} disabled={busy} onChange={(event) => change('show_invoices', event.target.checked)} />
        Client can see invoices
      </label>
      <label className="choice">
        <input type="checkbox" checked={values.show_drafts} disabled={busy || !values.show_invoices} onChange={(event) => change('show_drafts', event.target.checked)} />
        Include drafts
      </label>
      <a href={`/portal/${token}`} target="_blank" rel="noreferrer">
        Preview as the client
      </a>
    </div>
  );
}

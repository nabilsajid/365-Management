'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { INVOICE_PARTS, storeInvoiceOptions, type InvoiceOptions, type InvoicePart } from '@/lib/domain/invoice-options';
import { InvoiceSheet, type InvoiceSheetData } from './invoice-sheet';
import { toast } from './resource-manager';

/**
 * Admin: tick what the invoice shows and see it change straight away. Saved
 * choices apply to every invoice, its PDF and the link sent to the client.
 */
export function InvoiceEditor({ data, initial }: { data: InvoiceSheetData; initial: InvoiceOptions }) {
  const router = useRouter();
  const [options, setOptions] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const changed = JSON.stringify(options) !== saved;

  function toggle(key: InvoicePart, on: boolean) {
    setOptions((current) => ({ ...current, show: { ...current.show, [key]: on } }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/org-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_options: storeInvoiceOptions(options) }),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Could not save (${response.status}).`);
        return;
      }
      setSaved(JSON.stringify(options));
      toast('Invoice layout saved for all invoices.', 'success');
      startTransition(() => router.refresh());
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <details className="panel fold no-print">
        <summary>Choose what the invoice shows</summary>
        <p className="muted">Applies to every invoice, the downloaded PDF and the link sent to the client. The amount is always shown.</p>
        <div className="invoice-options">
          {INVOICE_PARTS.map((part) => (
            <label key={part.key} className="choice">
              <input type="checkbox" checked={options.show[part.key]} onChange={(event) => toggle(part.key, event.target.checked)} />
              {part.label}
            </label>
          ))}
        </div>
        <label className="field wide" style={{ marginTop: '0.75rem' }}>
          <span>Footer (optional)</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={options.footer}
            placeholder="For example: payment details, bKash number, or a thank-you line"
            onChange={(event) => setOptions((current) => ({ ...current, footer: event.target.value }))}
          />
        </label>
        <div className="actions" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="primary" onClick={save} disabled={busy || !changed}>
            {busy ? 'Saving…' : changed ? 'Save for all invoices' : 'Saved'}
          </button>
          {error ? (
            <span className="error" role="alert">
              {error}
            </span>
          ) : null}
        </div>
      </details>
      <InvoiceSheet data={data} options={options} />
    </>
  );
}

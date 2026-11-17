'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { INVOICE_PARTS, INVOICE_TEXTS, LOGO_OFFSET, LOGO_SIZE, storeInvoiceOptions, type InvoiceOptions, type InvoicePart, type InvoiceText } from '@/lib/domain/invoice-options';
import { LogoUploader, SignatureUploader } from './image-tools';
import { InvoiceSheet, type InvoiceSheetData } from './invoice-sheet';
import { toast } from './resource-manager';

/**
 * Admin: tick what the invoice shows and see it change straight away. Saved
 * choices apply to every invoice, its PDF and the link sent to the client.
 */
export function InvoiceEditor({ data, initial, logo = null, open = false }: { data: InvoiceSheetData; initial: InvoiceOptions; logo?: string | null; open?: boolean }) {
  const router = useRouter();
  const [options, setOptions] = useState(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const changed = JSON.stringify(options) !== saved;

  function setText(key: InvoiceText, value: string) {
    setOptions((current) => ({ ...current, text: { ...current.text, [key]: value }, footer: key === 'footer' ? value : current.footer }));
  }

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
    <div className="invoice-design">
      <details className="panel fold no-print invoice-design-controls" open={open}>
        <summary>Invoice design: logo, signature, payment details and what it shows</summary>
        <p className="muted">
          Applies to every invoice, the downloaded PDF and the link sent to the client. The preview changes as you
          type; press Save to keep it. A note for one invoice only goes in that invoice&apos;s Note (Cash Flow → Edit).
        </p>
        <div className="invoice-images">
          <div>
            <h3>Logo</h3>
            <LogoUploader current={logo} />
            <label className="field" style={{ marginTop: '0.6rem' }}>
              <span>Logo size on the invoice: {options.logoSize}px</span>
              <input
                type="range"
                min={LOGO_SIZE.min}
                max={LOGO_SIZE.max}
                value={options.logoSize}
                onChange={(event) => setOptions((current) => ({ ...current, logoSize: Number(event.target.value) }))}
              />
            </label>
            <label className="field">
              <span>Logo position, left ↔ right: {options.logoOffset}px</span>
              <input
                type="range"
                min={LOGO_OFFSET.min}
                max={LOGO_OFFSET.max}
                value={options.logoOffset}
                onChange={(event) => setOptions((current) => ({ ...current, logoOffset: Number(event.target.value) }))}
              />
            </label>
          </div>
          <div>
            <h3>Signature</h3>
            <SignatureUploader current={data.signature ?? null} />
          </div>
        </div>
        <h3 style={{ marginTop: '1rem' }}>Show on the invoice</h3>
        <div className="invoice-options">
          {INVOICE_PARTS.map((part) => (
            <label key={part.key} className="choice">
              <input type="checkbox" checked={options.show[part.key]} onChange={(event) => toggle(part.key, event.target.checked)} />
              {part.label}
            </label>
          ))}
        </div>
        <div className="invoice-texts">
          {INVOICE_TEXTS.map((item) => (
            <label key={item.key} className={item.rows > 1 ? 'field wide' : 'field'}>
              <span>{item.label}</span>
              {item.rows > 1 ? (
                <textarea
                  rows={item.rows}
                  maxLength={1000}
                  value={options.text[item.key]}
                  placeholder={item.placeholder}
                  onChange={(event) => setText(item.key, event.target.value)}
                />
              ) : (
                <input maxLength={200} value={options.text[item.key]} placeholder={item.placeholder} onChange={(event) => setText(item.key, event.target.value)} />
              )}
            </label>
          ))}
        </div>
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
      <div className="invoice-design-preview">
        <p className="muted no-print invoice-design-label">Preview</p>
        <InvoiceSheet data={data} options={options} />
      </div>
    </div>
  );
}

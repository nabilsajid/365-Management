'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { money } from '@/lib/format';

type Line = { kind: string | null; description: string; quantity: string; unit_price: string };

/**
 * A separate invoice for a month's extras on a monthly client. It starts with
 * what was delivered beyond the fixed deliverables, at the prices used last time;
 * every line can be changed, removed or added.
 */
export function ExtrasInvoiceForm({
  projectId,
  monthId,
  suggested,
  rates,
}: {
  projectId: string;
  monthId: string;
  suggested: { kind: string; description: string; quantity: number }[];
  rates: Record<string, number>;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>(() =>
    suggested.length > 0
      ? suggested.map((line) => ({ kind: line.kind, description: line.description, quantity: String(line.quantity), unit_price: rates[line.kind] ? String(rates[line.kind]) : '' }))
      : [{ kind: null, description: '', quantity: '1', unit_price: '' }],
  );
  const [due, setDue] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unit_price) || 0), 0);
  const update = (index: number, change: Partial<Line>) => setLines(lines.map((line, at) => (at === index ? { ...line, ...change } : line)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/invoices/extras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_id: projectId, month_id: monthId, due_date: due || null, note: note || null, lines }),
    });
    setBusy(false);
    const result = (await response.json().catch(() => null)) as { data?: { id: string }; error?: { message?: string } } | null;
    if (!response.ok || !result?.data) return setError(result?.error?.message ?? `Could not make the invoice (${response.status}).`);
    router.push(`/invoices/${result.data.id}`);
  }

  return (
    <form onSubmit={submit} className="extras-form">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>What</th>
              <th className="num">Qty</th>
              <th className="num">Price each</th>
              <th className="num">Amount</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index}>
                <td>
                  <input aria-label="What" value={line.description} onChange={(event) => update(index, { description: event.target.value })} required placeholder="Extra reel, November 2026" />
                </td>
                <td className="num">
                  <input aria-label="Quantity" type="number" min={0} step="any" value={line.quantity} onChange={(event) => update(index, { quantity: event.target.value })} style={{ width: 70 }} required />
                </td>
                <td className="num">
                  <input aria-label="Price each" type="number" min={0} step="any" value={line.unit_price} onChange={(event) => update(index, { unit_price: event.target.value })} style={{ width: 110 }} required />
                </td>
                <td className="num">{money((Number(line.quantity) || 0) * (Number(line.unit_price) || 0))}</td>
                <td>
                  <button type="button" onClick={() => setLines(lines.filter((_, at) => at !== index))} disabled={lines.length === 1} aria-label="Remove line">
                    ×
                  </button>
                </td>
              </tr>
            ))}
            <tr className="total">
              <td colSpan={3}>
                <button type="button" onClick={() => setLines([...lines, { kind: null, description: '', quantity: '1', unit_price: '' }])}>
                  Add a line
                </button>
              </td>
              <td className="num">
                <strong>{money(total)}</strong>
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Due date (optional)</span>
          <input type="date" value={due} onChange={(event) => setDue(event.target.value)} />
        </label>
        <label className="field">
          <span>Note on the invoice (optional)</span>
          <input value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <button type="submit" className="primary" disabled={busy || total <= 0}>
          {busy ? 'Making the invoice…' : `Create extras invoice · ${money(total)}`}
        </button>
      </div>
    </form>
  );
}

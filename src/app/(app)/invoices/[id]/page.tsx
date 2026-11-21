import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { InvoiceSheet, loadInvoiceSheet } from '@/components/invoice-sheet';
import { PrintButton } from '@/components/print-button';
import { ApiForm } from '@/components/resource-manager';
import { ShareLink } from '@/components/share-link';
import { getPageContext } from '@/lib/page';

// One invoice, ready to print or save as a PDF. Admins can share it with the client by link.
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, isAdmin, can, canEdit, localDate } = await getPageContext();
  if (!can('cashflow')) redirect('/dashboard');
  const invoice = await supabase.from('invoices').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!invoice.data) notFound();
  const row = invoice.data as Record<string, unknown>;
  const { data, options } = await loadInvoiceSheet(supabase as never, row);
  const shareReady = 'share_token' in row;
  // Recording a payment here: what is still owed, and the accounts it can go into.
  const mayRecord = (isAdmin || canEdit('cashflow')) && row.status !== 'void';
  const outstanding = Math.max(0, Number(data.amount) - Number(data.paid));
  const accounts = mayRecord ? await supabase.from('accounts').select('id, name').eq('org_id', orgId).order('name') : { data: [] };

  return (
    <>
      <div className="page-header no-print">
        <div>
          <p className="muted">
            <Link href="/cashflow?tab=income">Cash Flow</Link> / Invoices
          </p>
          <h1>Invoice {data.invoiceNumber}</h1>
        </div>
        <PrintButton />
      </div>
      {isAdmin && shareReady ? (
        <section className="panel no-print">
          <header className="panel-header">
            <div>
              <h2>Share with the client</h2>
              <p className="muted">The client opens the link to see this invoice and save it as a PDF. Turn it off at any time.</p>
            </div>
          </header>
          <ShareLink endpoint={`/api/invoices/${id}/share`} basePath="/invoice" token={(row.share_token as string | null) ?? null} createLabel="Make a client link" />
        </section>
      ) : null}
      {mayRecord && outstanding > 0 ? (
        <details className="panel fold no-print">
          <summary>Record a payment · {outstanding.toLocaleString('en-US')} still due</summary>
          <p className="muted">Records money received for this invoice. It updates Paid so far, the account balance and Money in.</p>
          <ApiForm
            endpoint="/api/payments"
            submitLabel="Record payment"
            fixedValues={{ invoice_id: id }}
            initial={{ amount: String(outstanding), paid_on: localDate(new Date().toISOString()) }}
            fields={[
              {
                name: 'account_id',
                label: 'Into account',
                type: 'select',
                required: true,
                options: ((accounts.data ?? []) as { id: string; name: string }[]).map((account) => ({ value: account.id, label: account.name })),
              },
              { name: 'amount', label: 'Amount', type: 'number', required: true, hint: 'Change it for a part payment.' },
              { name: 'paid_on', label: 'Date', type: 'date', required: true },
              { name: 'method', label: 'Method', placeholder: 'Bank transfer, bKash, cash…' },
              { name: 'note', label: 'Note' },
            ]}
          />
        </details>
      ) : null}
      {isAdmin ? (
        <p className="muted no-print">
          To change the design of every invoice (logo, signature, payment details and more), go to{' '}
          <Link href="/settings?tab=invoice">Settings → Invoice</Link>.
        </p>
      ) : null}
      <InvoiceSheet data={data} options={options} />
    </>
  );
}

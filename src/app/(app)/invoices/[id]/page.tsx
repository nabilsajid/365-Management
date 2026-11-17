import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { InvoiceSheet, loadInvoiceSheet } from '@/components/invoice-sheet';
import { PrintButton } from '@/components/print-button';
import { ShareLink } from '@/components/share-link';
import { getPageContext } from '@/lib/page';

// One invoice, ready to print or save as a PDF. Admins can share it with the client by link.
export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, isAdmin, can } = await getPageContext();
  if (!can('cashflow')) redirect('/dashboard');
  const invoice = await supabase.from('invoices').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!invoice.data) notFound();
  const row = invoice.data as Record<string, unknown>;
  const { data, options } = await loadInvoiceSheet(supabase as never, row);
  const shareReady = 'share_token' in row;

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

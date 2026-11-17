import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { InvoiceSheet, loadInvoiceSheet } from '@/components/invoice-sheet';
import { PrintButton } from '@/components/print-button';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } };

// One of the client's invoices from their portal: print it or save it as a PDF.
export default async function PortalInvoicePage({ params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  if (!/^[0-9a-f]{64}$/.test(token) || !/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const portal = await admin.from('client_portals').select('client_id').eq('token', token).eq('is_active', true).maybeSingle();
  if (!portal.data) notFound();
  const invoice = await admin.from('invoices').select('*').eq('id', id).eq('client_id', (portal.data as { client_id: string }).client_id).neq('status', 'draft').maybeSingle();
  if (!invoice.data) notFound();
  const { data, options } = await loadInvoiceSheet(admin as never, invoice.data as Record<string, unknown>);
  return (
    <main className="public-page">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Link href={`/portal/${token}`}>← Back to your projects</Link>
        <PrintButton />
      </div>
      <InvoiceSheet data={data} options={options} />
    </main>
  );
}

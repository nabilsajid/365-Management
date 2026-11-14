import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { InvoiceSheet, loadInvoiceSheet } from '@/components/invoice-sheet';
import { PrintButton } from '@/components/print-button';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Invoice', robots: { index: false, follow: false } };

// The invoice a client opens from the link an admin shared. Nothing else is shown.
export default async function SharedInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const invoice = await admin.from('invoices').select('*').eq('share_token', token).maybeSingle();
  if (!invoice.data) notFound();
  const { data, options } = await loadInvoiceSheet(admin as never, invoice.data as Record<string, unknown>);
  return (
    <main className="public-page">
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PrintButton />
      </div>
      <InvoiceSheet data={data} options={options} />
    </main>
  );
}

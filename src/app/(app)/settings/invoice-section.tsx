import { InvoiceEditor } from '@/components/invoice-editor';
import { isFirstCompany, loadInvoiceSheet, type InvoiceSheetData } from '@/components/invoice-sheet';
import { readInvoiceOptions } from '@/lib/domain/invoice-options';
import { getPageContext } from '@/lib/page';

/**
 * Settings → Invoice: the design every invoice uses: logo, signature, payment
 * details, the signer's name and designation, thank-you line, contacts, and what
 * each invoice shows. Previewed on your latest invoice, or a sample one.
 */
export async function InvoiceSection() {
  const { supabase, orgId } = await getPageContext();
  const latest = await supabase.from('invoices').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (latest.data) {
    const { data, options } = await loadInvoiceSheet(supabase as never, latest.data as Record<string, unknown>);
    return <InvoiceEditor data={data} initial={options} logo={data.logo ?? null} open />;
  }
  const [org, logo, signature] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('org_logos').select('data').eq('org_id', orgId).maybeSingle(),
    supabase.from('org_signatures').select('data').eq('org_id', orgId).maybeSingle(),
  ]);
  const orgRow = org.data as { name: string; currency?: string; invoice_options?: unknown; contact_phone?: string | null; contact_email?: string | null } | null;
  const sample: InvoiceSheetData = {
    orgName: orgRow?.name ?? '',
    logo: (logo.data as { data?: string } | null)?.data ?? null,
    signature: (signature.data as { data?: string } | null)?.data ?? null,
    builtInLogo: await isFirstCompany(supabase, orgId),
    currency: orgRow?.currency ?? 'BDT',
    orgPhone: orgRow?.contact_phone ?? null,
    orgEmail: orgRow?.contact_email ?? null,
    invoiceNumber: 'SAMPLE-001',
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: null,
    status: 'draft',
    amount: 35000,
    paid: 0,
    notes: null,
    lines: [{ description: 'Long Form Content with Social Media Management', quantity: 1, unit_price: 35000 }],
    clientName: 'Sample Client',
    clientContact: null,
    clientEmail: null,
    clientPhone: null,
    projectName: null,
  };
  return <InvoiceEditor data={sample} initial={readInvoiceOptions(orgRow?.invoice_options)} logo={sample.logo ?? null} open />;
}

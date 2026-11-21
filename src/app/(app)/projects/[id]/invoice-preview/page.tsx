import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { InvoiceSheet, isFirstCompany, type InvoiceSheetData } from '@/components/invoice-sheet';
import { PrintButton } from '@/components/print-button';
import { ActionButton } from '@/components/resource-manager';
import { describeFixed, type FixedDeliverable } from '@/lib/domain/deliverables';
import { readInvoiceOptions } from '@/lib/domain/invoice-options';
import { getPageContext } from '@/lib/page';

// A monthly client's invoice for a month, any time: the saved draft if it has
// been made, otherwise a preview of what the 1st will draft (nothing is saved).
export default async function MonthlyInvoicePreview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const { id } = await params;
  const { month: monthId } = await searchParams;
  const { supabase, orgId, isAdmin, can, canEdit } = await getPageContext();
  if (!isAdmin && !can('cashflow')) redirect(`/projects/${id}`);
  const project = await supabase.from('projects').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!project.data) notFound();
  const row = project.data as { id: string; name: string; client_id: string | null; monthly_fee?: number | null };

  const monthResult = monthId
    ? await supabase.from('project_months').select('id, month').eq('id', monthId).eq('project_id', id).maybeSingle()
    : await supabase.from('project_months').select('id, month').eq('project_id', id).order('month', { ascending: false }).limit(1).maybeSingle();
  const month = monthResult.data as { id: string; month: string } | null;
  if (month) {
    const saved = await supabase.from('invoices').select('id').eq('project_month_id', month.id).eq('is_extras', false).maybeSingle();
    if (saved.data) redirect(`/invoices/${(saved.data as { id: string }).id}`);
  }

  const [org, logo, signature, client, targets] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('org_logos').select('data').eq('org_id', orgId).maybeSingle(),
    supabase.from('org_signatures').select('data').eq('org_id', orgId).maybeSingle(),
    row.client_id ? supabase.from('clients').select('name, contact_name, email, phone').eq('id', row.client_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from('project_targets').select('kind, quantity, label').eq('project_id', id).order('position'),
  ]);
  const orgRow = org.data as { name: string; currency?: string; invoice_options?: unknown; contact_phone?: string | null; contact_email?: string | null; contact_address?: string | null; website?: string | null } | null;
  const c = client.data as { name: string; contact_name: string | null; email: string | null; phone: string | null } | null;
  const monthDate = month?.month ?? new Date().toISOString().slice(0, 8) + '01';
  const monthLabel = new Date(`${monthDate}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const fixed = ((targets.data ?? []) as FixedDeliverable[]).map(describeFixed).join(', ');
  const fee = Number(row.monthly_fee ?? 0);

  const data: InvoiceSheetData = {
    orgName: orgRow?.name ?? '',
    logo: (logo.data as { data?: string } | null)?.data ?? null,
    signature: (signature.data as { data?: string } | null)?.data ?? null,
    builtInLogo: await isFirstCompany(supabase, orgId),
    currency: orgRow?.currency ?? 'BDT',
    orgPhone: orgRow?.contact_phone ?? null,
    orgEmail: orgRow?.contact_email ?? null,
    orgLines: [orgRow?.contact_address, orgRow?.website].filter((line): line is string => Boolean(line)),
    invoiceNumber: 'Draft',
    issueDate: monthDate,
    dueDate: null,
    status: 'draft',
    amount: fee,
    paid: 0,
    notes: null,
    lines: [{ description: `Monthly package, ${monthLabel}${fixed ? `: ${fixed}` : ''}`, quantity: 1, unit_price: fee }],
    clientName: c?.name ?? '—',
    clientContact: c?.contact_name ?? null,
    clientEmail: c?.email ?? null,
    clientPhone: c?.phone ?? null,
    projectName: row.name,
  };

  return (
    <>
      <div className="page-header no-print">
        <div>
          <p className="muted">
            <Link href={`/projects/${id}`}>{row.name}</Link> / Monthly invoice
          </p>
          <h1>{monthLabel} invoice · preview</h1>
        </div>
        <PrintButton />
      </div>
      <section className="panel no-print">
        {fee > 0 && c && month && (isAdmin || canEdit('cashflow')) ? (
          <div style={{ marginBottom: '0.6rem' }}>
            <ActionButton endpoint="/api/invoices/month" body={{ month_id: month.id }} primary>
              Create this month&apos;s invoice now
            </ActionButton>
          </div>
        ) : null}
        <p className="muted" style={{ margin: 0 }}>
          {fee > 0
            ? `This is what will be drafted on the 1st. Nothing is saved yet. Create it now if you do not want to wait (for example, the fee was set mid-month); then this page opens the real draft to edit and send.`
            : 'This client has no monthly fee yet, so no invoice is drafted. Add one under Edit project → Monthly fee.'}
          {!c ? ' Give the project a client so it can be invoiced.' : ''}
        </p>
      </section>
      <InvoiceSheet data={data} options={readInvoiceOptions(orgRow?.invoice_options)} />
    </>
  );
}

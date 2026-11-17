import { z } from 'zod';
import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { TASK_KINDS } from '@/lib/domain/deliverables';

const extrasInvoice = z.object({
  project_id: z.string().uuid(),
  month_id: z.string().uuid(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  note: z.string().trim().max(1000).nullish(),
  lines: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Describe each line.').max(200),
        quantity: z.coerce.number().positive('Quantity must be above 0.').max(10000),
        unit_price: z.coerce.number().min(0).max(100000000),
        kind: z.enum(TASK_KINDS).nullish(),
      }),
    )
    .min(1, 'Add at least one line.')
    .max(50),
});

// A separate invoice for one month's extras on a monthly client: each line is
// what, how many and the price each. It starts as a draft, in the same design
// as every invoice. The prices are remembered for next time.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireWriter(['cashflow']);
  if (auth.response) return auth.response;
  const { ctx, mode } = auth;
  if (mode !== 'apply') return fail(403, 'Only an admin or someone who edits Cash Flow can make invoices.');
  const body = await readJson(request, extrasInvoice);
  if (body.response) return body.response;
  const input = body.data;
  const orgId = ctx.profile.org_id;

  const [project, month] = await Promise.all([
    ctx.supabase.from('projects').select('id, name, client_id, extra_rates').eq('id', input.project_id).eq('org_id', orgId).maybeSingle(),
    ctx.supabase.from('project_months').select('id, month').eq('id', input.month_id).eq('project_id', input.project_id).maybeSingle(),
  ]);
  if (project.error) return fromDbError(project.error);
  if (!project.data || !month.data) return fail(404, 'Not found.');
  const row = project.data as { id: string; name: string; client_id: string | null; extra_rates: Record<string, number> | null };
  if (!row.client_id) return fail(400, 'Give this project a client first, under Edit project.');
  const monthDate = (month.data as { month: string }).month;

  const existing = await ctx.supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('project_month_id', input.month_id).eq('is_extras', true);
  const number = `INV-${monthDate.slice(0, 7)}-${row.id.replace(/-/g, '').slice(0, 4).toUpperCase()}-X${(existing.count ?? 0) + 1}`;
  const lines = input.lines.map((line) => ({ description: line.description, quantity: line.quantity, unit_price: line.unit_price }));
  const amount = Math.round(lines.reduce((total, line) => total + line.quantity * line.unit_price, 0) * 100) / 100;
  if (amount <= 0) return fail(400, 'The total must be above 0.');

  const saved = await ctx.supabase
    .from('invoices')
    .insert({
      org_id: orgId,
      client_id: row.client_id,
      project_id: row.id,
      project_month_id: input.month_id,
      is_extras: true,
      invoice_number: number,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: input.due_date ?? null,
      amount,
      status: 'draft',
      notes: input.note || null,
      lines,
    })
    .select('id')
    .single();
  if (saved.error) return fromDbError(saved.error);

  // Remember the price of each type for the next extras invoice.
  const rates = { ...(row.extra_rates ?? {}) };
  for (const line of input.lines) if (line.kind && line.unit_price > 0) rates[line.kind] = line.unit_price;
  await ctx.supabase.from('projects').update({ extra_rates: rates }).eq('id', row.id);
  return ok({ id: saved.data.id }, 201);
}

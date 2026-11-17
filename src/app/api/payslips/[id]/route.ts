import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { netPay } from '@/lib/domain/payroll';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money = z.coerce.number().min(0, 'Use 0 or more.').max(100000000);
const payslipUpdate = z.object({
  base_salary: money.optional(),
  bonus: money.optional(),
  additions: money.optional(),
  deductions: money.optional(),
  note: z.string().trim().max(1000).nullish(),
  // Choosing the account it was paid from marks the payslip paid and records the salary as an expense.
  account_id: z.string().uuid().or(z.literal('')).nullish(),
});

// Admin: adjust a draft payslip, or pay it.
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, payslipUpdate);
  if (body.response) return body.response;
  const current = await ctx.supabase.from('payslips').select('*').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (current.error) return fromDbError(current.error);
  if (!current.data) return fail(404, 'Not found.');
  const slip = current.data as { status: string; profile_id: string; month: string; base_salary: number; bonus: number; additions: number; deductions: number };
  if (slip.status === 'paid') return fail(400, 'This payslip is already paid. Delete it to start again.');

  const { account_id: accountId, ...changes } = body.data;
  const next = { ...slip, ...changes };
  if (accountId) {
    const person = await ctx.supabase.from('profiles').select('full_name').eq('id', slip.profile_id).maybeSingle();
    const label = new Date(`${slip.month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const amount = netPay(next);
    let expenseId: string | null = null;
    if (amount > 0) {
      const expense = await ctx.supabase
        .from('expenses')
        .insert({
          org_id: ctx.profile.org_id,
          category: 'salary',
          description: `Salary · ${(person.data as { full_name?: string } | null)?.full_name ?? 'Employee'} · ${label}`,
          amount,
          account_id: accountId,
          created_by: ctx.userId,
        })
        .select('id')
        .single();
      if (expense.error) return fromDbError(expense.error);
      expenseId = expense.data.id as string;
    }
    const { error } = await ctx.supabase
      .from('payslips')
      .update({ ...changes, status: 'paid', paid_on: new Date().toISOString().slice(0, 10), expense_id: expenseId })
      .eq('id', id);
    if (error) return fromDbError(error);
    return ok({ paid: true });
  }
  const { error } = await ctx.supabase.from('payslips').update(changes).eq('id', id);
  if (error) return fromDbError(error);
  return ok({ saved: true });
}

export async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { data, error } = await ctx.supabase.from('payslips').delete().eq('id', id).eq('org_id', ctx.profile.org_id).select('id').maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  return ok({ deleted: true });
}

import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { netPay } from '@/lib/domain/payroll';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const paidOn = new Date().toISOString().slice(0, 10);
    const { error } = await ctx.supabase
      .from('payslips')
      .update({ ...changes, status: 'paid', paid_on: paidOn, expense_id: expenseId })
      .eq('id', id);
    if (error) return fromDbError(error);
    await draftSalaryEmail(ctx.profile.org_id, slip.profile_id, id, label, { ...next, paid_on: paidOn }, new URL(request.url).origin);
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
  const { data, error } = await ctx.supabase.from('payslips').delete().eq('id', id).eq('org_id', ctx.profile.org_id).select('id, expense_id').maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'Not found.');
  // A paid payslip's salary expense goes with it, so Cash Flow matches.
  const expenseId = (data as { expense_id: string | null }).expense_id;
  if (expenseId) await ctx.supabase.from('expenses').delete().eq('id', expenseId).eq('org_id', ctx.profile.org_id);
  return ok({ deleted: true, expenseRemoved: Boolean(expenseId) });
}

/**
 * The salary email for a paid payslip, saved as a draft: it is only sent after
 * an admin (or someone allowed to approve emails) checks it on Email approvals.
 */
async function draftSalaryEmail(
  orgId: string,
  profileId: string,
  payslipId: string,
  monthLabel: string,
  slip: { base_salary: number; bonus: number; additions: number; deductions: number; paid_on: string },
  appUrl: string,
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) return;
  const [user, person, org] = await Promise.all([
    admin.auth.admin.getUserById(profileId),
    admin.from('profiles').select('full_name').eq('id', profileId).maybeSingle(),
    admin.from('organizations').select('name, currency').eq('id', orgId).maybeSingle(),
  ]);
  const email = user.data.user?.email;
  if (!email) return;
  const name = (person.data as { full_name?: string } | null)?.full_name ?? '';
  const company = org.data as { name?: string; currency?: string } | null;
  const amount = (value: number) => `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${company?.currency ?? 'BDT'}`;
  const lines = [
    `Hi ${name.split(' ')[0] || 'there'},`,
    '',
    `Your salary for ${monthLabel} has been sent.`,
    '',
    `Monthly salary: ${amount(slip.base_salary)}`,
    ...(Number(slip.bonus) > 0 ? [`Bonus: ${amount(slip.bonus)}`] : []),
    ...(Number(slip.additions) > 0 ? [`Other additions: ${amount(slip.additions)}`] : []),
    ...(Number(slip.deductions) > 0 ? [`Deductions: ${amount(slip.deductions)}`] : []),
    `Take-home pay: ${amount(netPay(slip))}`,
    `Paid on: ${slip.paid_on}`,
    '',
    `Your payslip: ${appUrl}/payslips/${payslipId}`,
    '',
    `Thank you,`,
    company?.name ?? '',
  ];
  const saved = await admin.from('email_outbox').insert({
    org_id: orgId,
    to_profile_id: profileId,
    to_email: email,
    kind: 'salary',
    subject: `Your salary for ${monthLabel} has been sent`,
    body: lines.join('\n'),
    related_href: `/payslips/${payslipId}`,
  });
  if (!saved.error) await admin.rpc('notify_email_approvers', { p_org: orgId, p_count: 1 });
}

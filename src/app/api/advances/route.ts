import { requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { salaryAdvanceCreate } from '@/lib/validation';

// Admin: money given to someone ahead of their salary. Choosing the account it
// came from records it in Cash Flow. Each payslip made afterwards takes back the
// monthly instalment until it is repaid.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, salaryAdvanceCreate);
  if (body.response) return body.response;
  const orgId = ctx.profile.org_id;
  const { account_id: accountId, ...advance } = body.data;
  let expenseId: string | null = null;
  if (accountId) {
    const person = await ctx.supabase.from('profiles').select('full_name').eq('id', advance.profile_id).maybeSingle();
    const expense = await ctx.supabase
      .from('expenses')
      .insert({
        org_id: orgId,
        category: 'salary',
        description: `Salary advance · ${(person.data as { full_name?: string } | null)?.full_name ?? 'Employee'}`,
        amount: advance.amount,
        account_id: accountId,
        created_by: ctx.userId,
      })
      .select('id')
      .single();
    if (expense.error) return fromDbError(expense.error);
    expenseId = expense.data.id as string;
  }
  const { data, error } = await ctx.supabase
    .from('salary_advances')
    .insert({ ...advance, org_id: orgId, account_id: accountId ?? null, expense_id: expenseId, created_by: ctx.userId })
    .select('id')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}

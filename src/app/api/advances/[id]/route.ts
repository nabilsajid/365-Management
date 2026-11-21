import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

// Admin: removes an advance (and the Cash Flow entry it made). Payslips already
// made keep what they took back.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  const { data, error } = await ctx.supabase
    .from('salary_advances')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('id, expense_id')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'That advance was not found.');
  const expenseId = (data as { expense_id: string | null }).expense_id;
  if (expenseId) await ctx.supabase.from('expenses').delete().eq('id', expenseId).eq('org_id', ctx.profile.org_id);
  return ok({ deleted: true });
}

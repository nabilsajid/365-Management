import { requireContext } from '@/lib/api/context';
import { fromDbError, ok } from '@/lib/api/http';

// Admin: what was deleted in the last 3 days.
export async function GET(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { data, error } = await ctx.supabase
    .from('delete_log')
    .select('*')
    .eq('org_id', ctx.profile.org_id)
    .order('deleted_at', { ascending: false });
  if (error) return fromDbError(error);
  return ok(data);
}

// Admin: clear the whole log at once.
export async function DELETE(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { error } = await ctx.supabase.from('delete_log').delete().eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ cleared: true });
}

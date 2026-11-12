import { requireContext } from '@/lib/api/context';
import { fromDbError, ok } from '@/lib/api/http';

// Admins get every change request; everyone else gets the ones they made.
export async function GET(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  let query = ctx.supabase.from('change_requests').select('*').eq('org_id', ctx.profile.org_id);
  const status = new URL(request.url).searchParams.get('status');
  if (status) query = query.eq('status', status);
  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return fromDbError(error);
  return ok(data);
}

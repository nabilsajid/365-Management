import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { companyView } from '@/lib/validation';

// Owner: step into a company as its admin, or back to your own (org_id: null).
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  if (!auth.ctx.owner) return fail(403, 'Only the owner of the app can switch companies.');
  const body = await readJson(request, companyView);
  if (body.response) return body.response;
  const { error } = await auth.ctx.supabase.rpc('view_company', { p_org: body.data.org_id });
  if (error) return fromDbError(error);
  return ok({ org_id: body.data.org_id });
}

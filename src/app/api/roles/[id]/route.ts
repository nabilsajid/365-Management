import { crud, requireContext } from '@/lib/api/context';
import { fail } from '@/lib/api/http';
import { roles } from '@/lib/api/resources';

type RouteParams = { params: Promise<{ id: string }> };

const handlers = crud.item(roles);

export const GET = handlers.GET;
export const PATCH = handlers.PATCH;

export async function DELETE(request: Request, route: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await route.params;

  const role = await ctx.supabase.from('roles').select('is_admin').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (role.data?.is_admin) return fail(400, 'The Admin role cannot be deleted.');
  return handlers.DELETE(request, route);
}

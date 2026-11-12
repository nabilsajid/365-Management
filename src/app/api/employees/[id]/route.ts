import { crud, requireContext } from '@/lib/api/context';
import { fail } from '@/lib/api/http';
import { employees } from '@/lib/api/resources';
import { ADMIN_ROLE } from '@/lib/domain/roles';

type RouteParams = { params: Promise<{ id: string }> };

const handlers = crud.item(employees);

export const GET = handlers.GET;

export async function PATCH(request: Request, route: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;

  // An admin cannot lock themselves out by changing their own role or deactivating their own account.
  const { id } = await route.params;
  if (id === auth.ctx.userId) {
    const body = (await request.clone().json().catch(() => null)) as Record<string, unknown> | null;
    const changesRole = body && 'job_title' in body && body.job_title !== ADMIN_ROLE;
    if (body && (changesRole || body.is_active === false)) {
      return fail(400, 'You cannot remove your own admin access. Ask another admin to do it.');
    }
  }
  return handlers.PATCH(request, route);
}

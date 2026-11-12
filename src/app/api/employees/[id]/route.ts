import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { employees } from '@/lib/api/resources';
import { employeeUpdate } from '@/lib/validation';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = crud.item(employees).GET;

// Admin edits a person: their name, whether they are active, and their roles.
export async function PATCH(request: Request, route: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const orgId = ctx.profile.org_id;
  const { id } = await route.params;

  const body = await readJson(request, employeeUpdate);
  if (body.response) return body.response;
  const { role_ids: roleIds, ...fields } = body.data;
  if (roleIds === undefined && Object.keys(fields).length === 0) return fail(400, 'Nothing to update.');

  const person = await ctx.supabase.from('profiles').select('id').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (person.error) return fromDbError(person.error);
  if (!person.data) return fail(404, 'Not found.');

  // An admin cannot lock themselves out.
  if (id === ctx.userId) {
    if (fields.is_active === false) return fail(400, 'You cannot deactivate your own account.');
    if (roleIds) {
      const adminRoles = await ctx.supabase.from('roles').select('id').eq('org_id', orgId).eq('is_admin', true).in('id', roleIds);
      if (!adminRoles.data || adminRoles.data.length === 0) {
        return fail(400, 'You cannot remove your own Admin role. Ask another admin to do it.');
      }
    }
  }

  if (roleIds) {
    const assigned = await ctx.supabase.rpc('set_profile_roles', { p_profile: id, p_roles: roleIds });
    if (assigned.error) return fromDbError(assigned.error);
  }
  if (Object.keys(fields).length > 0) {
    const updated = await ctx.supabase.from('profiles').update(fields).eq('id', id).eq('org_id', orgId);
    if (updated.error) return fromDbError(updated.error);
  }

  const { data, error } = await ctx.supabase.from('profiles').select('*').eq('id', id).single();
  if (error) return fromDbError(error);
  return ok(data);
}

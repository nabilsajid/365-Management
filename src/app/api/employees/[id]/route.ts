import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { employees } from '@/lib/api/resources';
import { createAdminClient } from '@/lib/supabase/admin';
import { employeeUpdate } from '@/lib/validation';

type RouteParams = { params: Promise<{ id: string }> };

export const GET = crud.item(employees).GET;

// Admin edits a person: name, sign-in email, contact details, roles, and
// whether they are suspended (is_active false: they cannot sign in).
export async function PATCH(request: Request, route: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const orgId = ctx.profile.org_id;
  const { id } = await route.params;

  const body = await readJson(request, employeeUpdate);
  if (body.response) return body.response;
  const { role_ids: roleIds, email, address, secondary_contact: secondaryContact, ...fields } = body.data;
  const privateGiven = address !== undefined || secondaryContact !== undefined;
  if (roleIds === undefined && !email && !privateGiven && Object.keys(fields).length === 0) return fail(400, 'Nothing to update.');

  const person = await ctx.supabase.from('profiles').select('id').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (person.error) return fromDbError(person.error);
  if (!person.data) return fail(404, 'Not found.');

  // An admin cannot lock themselves out.
  if (id === ctx.userId) {
    if (fields.is_active === false) return fail(400, 'You cannot suspend your own account.');
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
  if (email) {
    const admin = createAdminClient();
    if (!admin) return fail(501, 'Changing a login email needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
    const current = await admin.auth.admin.getUserById(id);
    if (current.data?.user?.email?.toLowerCase() !== email) {
      const changed = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (changed.error) return fail(400, changed.error.message);
    }
  }
  if (Object.keys(fields).length > 0) {
    const updated = await ctx.supabase.from('profiles').update(fields).eq('id', id).eq('org_id', orgId);
    if (updated.error) return fromDbError(updated.error);
  }
  if (privateGiven) {
    const kept = await ctx.supabase.from('profile_private').select('address, secondary_contact').eq('profile_id', id).maybeSingle();
    const saved = await ctx.supabase.from('profile_private').upsert(
      {
        profile_id: id,
        org_id: orgId,
        address: address !== undefined ? address || null : (kept.data?.address ?? null),
        secondary_contact: secondaryContact !== undefined ? secondaryContact || null : (kept.data?.secondary_contact ?? null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' },
    );
    if (saved.error) return fromDbError(saved.error);
  }

  const { data, error } = await ctx.supabase.from('profiles').select('*').eq('id', id).single();
  if (error) return fromDbError(error);
  return ok(data);
}

// Admin removes a person for good: their account and everything recorded
// about them (points, attendance, bonuses). Work they were assigned stays,
// without their name. To keep the history, suspend them instead.
export async function DELETE(_request: Request, route: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await route.params;
  if (id === ctx.userId) return fail(400, 'You cannot delete your own account.');

  const person = await ctx.supabase.from('profiles').select('id').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (person.error) return fromDbError(person.error);
  if (!person.data) return fail(404, 'Not found.');

  const admin = createAdminClient();
  if (!admin) return fail(501, 'Deleting employees needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
  const removed = await admin.auth.admin.deleteUser(id);
  if (removed.error) return fail(400, removed.error.message);
  return ok({ deleted: true });
}

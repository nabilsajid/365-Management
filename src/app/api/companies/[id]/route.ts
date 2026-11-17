import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const confirmDelete = z.object({ confirm: z.string() });

// Owner: delete a customer company for good: its people's logins, projects,
// money records and everything else. Never your own company, nor the one open
// right now, and only after typing the company's name.
export async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  if (!ctx.owner) return fail(403, 'Only the owner of the app can delete companies.');
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const homeOrgId = ctx.companyView?.homeOrgId ?? ctx.profile.org_id;
  if (id === homeOrgId) return fail(400, 'Your own company cannot be deleted.');
  if (id === ctx.profile.org_id) return fail(400, 'Go back to your own company before deleting this one.');
  const body = await readJson(request, confirmDelete);
  if (body.response) return body.response;

  const admin = createAdminClient();
  if (!admin) return fail(501, 'Deleting companies needs SUPABASE_SERVICE_ROLE_KEY on the server.');
  const org = await admin.from('organizations').select('name').eq('id', id).maybeSingle();
  if (org.error) return fromDbError(org.error);
  if (!org.data) return fail(404, 'Not found.');
  const name = (org.data as { name: string }).name;
  if (body.data.confirm.trim().toLowerCase() !== name.trim().toLowerCase()) return fail(400, `Type "${name}" to confirm.`);

  // Its people, so their logins can be removed once the company is gone.
  const people = await admin.from('profiles').select('id').eq('org_id', id);
  if (people.error) return fromDbError(people.error);
  const gone = await admin.rpc('delete_company', { p_org: id });
  if (gone.error) return fromDbError(gone.error);
  for (const person of (people.data ?? []) as { id: string }[]) await admin.auth.admin.deleteUser(person.id);
  return ok({ deleted: true, name });
}

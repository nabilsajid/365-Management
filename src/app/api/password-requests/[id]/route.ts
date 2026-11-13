import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { passwordRequestResolve } from '@/lib/validation';
import type { PasswordRequest } from '@/types/database';

type RouteParams = { params: Promise<{ id: string }> };

// Admin deals with a forgotten-password request: sets a new password for the
// person, or dismisses the request. The password is passed straight to
// Supabase Auth and is never stored or logged by the app.
export async function POST(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;

  const body = await readJson(request, passwordRequestResolve);
  if (body.response) return body.response;

  const found = await ctx.supabase
    .from('password_requests')
    .select('*')
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .maybeSingle();
  if (found.error) return fromDbError(found.error);
  const pending = found.data as PasswordRequest | null;
  if (!pending) return fail(404, 'Not found.');
  if (pending.status !== 'pending') return fail(409, 'This request was already dealt with.');

  if (body.data.action === 'set') {
    const admin = createAdminClient();
    if (!admin) return fail(501, 'Setting passwords needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
    const changed = await admin.auth.admin.updateUserById(pending.profile_id, { password: body.data.password });
    if (changed.error) return fail(400, changed.error.message);
  }

  const { data, error } = await ctx.supabase
    .from('password_requests')
    .update({
      status: body.data.action === 'set' ? 'done' : 'dismissed',
      resolved_by: ctx.userId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('id, status')
    .single();
  if (error) return fromDbError(error);
  return ok(data);
}

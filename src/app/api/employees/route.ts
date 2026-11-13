import { randomInt } from 'node:crypto';
import { crud, requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { employees } from '@/lib/api/resources';
import { rememberPassword } from '@/lib/server/login-details';
import { createAdminClient } from '@/lib/supabase/admin';
import { employeeCreate } from '@/lib/validation';

export const GET = crud.collection(employees).GET;

// Letters and digits that are hard to mix up when read aloud or typed (no 0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const randomPassword = (length = 10) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

// Admin adds a new person: their account is created straight away with the
// email they will sign in with and a password (typed, or chosen here). No
// email is sent; the admin finds the password under Login details.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, employeeCreate);
  if (body.response) return body.response;

  const admin = createAdminClient();
  if (!admin) {
    return fail(501, 'Adding employees needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
  }

  const password = body.data.password || randomPassword();
  const made = await admin.auth.admin.createUser({ email: body.data.email, password, email_confirm: true });
  if (made.error || !made.data.user) {
    return fail(400, made.error?.message ?? 'The account could not be created.');
  }
  const userId = made.data.user.id;

  const created = await admin
    .from('profiles')
    .insert({ id: userId, org_id: ctx.profile.org_id, full_name: body.data.full_name })
    .select('id')
    .single();
  if (created.error) {
    await admin.auth.admin.deleteUser(userId);
    return fromDbError(created.error);
  }

  const assigned = await ctx.supabase.rpc('set_profile_roles', { p_profile: userId, p_roles: body.data.role_ids });
  if (assigned.error) {
    await admin.auth.admin.deleteUser(userId);
    return fromDbError(assigned.error);
  }

  const { data, error } = await ctx.supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) return fromDbError(error);
  await rememberPassword(ctx.supabase, data, password, ctx.userId);
  return ok(data, 201);
}

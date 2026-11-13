import { randomInt } from 'node:crypto';
import { requireContext } from '@/lib/api/context';
import { fail, ok } from '@/lib/api/http';
import { rememberPassword } from '@/lib/server/login-details';
import { open } from '@/lib/server/secret-box';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ApiContext } from '@/lib/api/crud';

// Letters and digits that are hard to mix up when read aloud or typed (no 0/O, 1/l/I).
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const randomPassword = (length = 10) => Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

/** Every password on record that can still be read, by person. `ready` is false until the login details table exists. */
async function onRecord(ctx: ApiContext): Promise<{ ready: boolean; passwords: Record<string, string> }> {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const { data, error } = await ctx.supabase
    .from('profile_credentials')
    .select('profile_id, password_cipher')
    .eq('org_id', ctx.profile.org_id);
  if (error || !key) return { ready: false, passwords: {} };
  const passwords: Record<string, string> = {};
  for (const row of (data ?? []) as { profile_id: string; password_cipher: string }[]) {
    const plain = open(row.password_cipher, key);
    if (plain !== null) passwords[row.profile_id] = plain;
  }
  return { ready: true, passwords };
}

// Admin: all passwords on record, for the Login details list.
export async function GET(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  return ok(await onRecord(auth.ctx));
}

// Admin: give every active employee who has no password on record a new,
// different one, and put it on record. People who already have one are left alone.
export async function POST(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const admin = createAdminClient();
  if (!admin) return fail(501, 'Setting passwords needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.');
  const current = await onRecord(ctx);
  if (!current.ready) {
    return fail(409, 'Run the file 20261112000014_login_details.sql in the Supabase SQL Editor first, so the new passwords can be kept.');
  }

  const people = await ctx.supabase
    .from('profiles')
    .select('id, org_id, access_role')
    .eq('org_id', ctx.profile.org_id)
    .eq('is_active', true)
    .neq('access_role', 'admin');
  const missing = ((people.data ?? []) as { id: string; org_id: string; access_role: string }[]).filter(
    (person) => !(person.id in current.passwords),
  );

  let changed = 0;
  for (const person of missing) {
    const password = randomPassword();
    const result = await admin.auth.admin.updateUserById(person.id, { password });
    if (result.error) continue;
    await rememberPassword(ctx.supabase, person, password, ctx.userId);
    changed += 1;
  }

  return ok({ changed, ...(await onRecord(ctx)) });
}

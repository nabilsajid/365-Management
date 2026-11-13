import type { SupabaseClient } from '@supabase/supabase-js';
import { open, seal } from './secret-box';

const secret = () => process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;

/**
 * Remembers the password an admin just gave someone, so admins can look it up
 * later. Never kept for admin accounts. Failing here must not undo the password
 * change itself, so problems (such as the table not existing yet) are ignored.
 */
export async function rememberPassword(
  supabase: SupabaseClient,
  target: { id: string; org_id: string; access_role: string },
  password: string,
  setBy: string,
): Promise<void> {
  const key = secret();
  if (!key) return;
  if (target.access_role === 'admin') {
    await supabase.from('profile_credentials').delete().eq('profile_id', target.id);
    return;
  }
  await supabase.from('profile_credentials').upsert(
    { profile_id: target.id, org_id: target.org_id, password_cipher: seal(password, key), set_by: setBy, updated_at: new Date().toISOString() },
    { onConflict: 'profile_id' },
  );
}

/** The stored password for one person, or null when none is on record or it cannot be read. */
export async function recallPassword(supabase: SupabaseClient, orgId: string, profileId: string): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const { data } = await supabase
    .from('profile_credentials')
    .select('password_cipher')
    .eq('org_id', orgId)
    .eq('profile_id', profileId)
    .maybeSingle();
  return data?.password_cipher ? open(data.password_cipher as string, key) : null;
}

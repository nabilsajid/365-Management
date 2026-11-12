import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. It bypasses row level security, so it is used only on
 * the server and only where a user session cannot do the job (inviting people).
 * Returns null when the service role key is not configured.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

import type { Profile } from '@/types/database';
import { createClient } from '@/lib/supabase/server';
import { authorize, makeCrud, type Access, type ApiContext } from './crud';

/** The signed-in user's Supabase client and profile, or null when signed out or deactivated. */
export async function getApiContext(): Promise<ApiContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  const profile = data as Profile | null;
  if (!profile || !profile.is_active) return null;

  return { supabase, userId: user.id, profile };
}

export const crud = makeCrud(getApiContext);

export function requireContext(access: Access) {
  return authorize(getApiContext, access);
}

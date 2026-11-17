import type { SupabaseClient } from '@supabase/supabase-js';

/** Everyone's profile photo in a company, by person. Empty when photos are not set up. */
export async function loadPhotos(supabase: SupabaseClient, orgId: string): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('profile_photos').select('profile_id, data').eq('org_id', orgId);
  if (error) return new Map();
  return new Map(((data ?? []) as { profile_id: string; data: string }[]).map((row) => [row.profile_id, row.data]));
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '?';

/** A round avatar: the person's photo, or their initials. */
export function Avatar({ name, photo, title }: { name: string; photo?: string | null; title?: string }) {
  return (
    <span className={photo ? 'avatar has-photo' : 'avatar'} title={title} aria-hidden={title ? undefined : true}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photo ? <img src={photo} alt="" /> : initials(name)}
    </span>
  );
}

import { cache } from 'react';
import type { Profile } from '@/types/database';
import { editSegmentsFromRoles, segmentsFromRoles } from '@/lib/domain/roles';
import { primeOrg } from '@/lib/services/rewards';
import { createClient } from '@/lib/supabase/server';
import { authorize, authorizeWrite, makeCrud, type Access, type ApiContext } from './crud';

/**
 * The signed-in user's Supabase client, profile and segments, or null when
 * signed out or deactivated.
 *
 * Wrapped in React's cache so the layout and the page share one lookup per
 * request. The user id comes from the session token's verified claims, which
 * avoids a network round trip to the auth server on every click; the
 * middleware has already refreshed the session.
 */
export const getApiContext = cache(async (): Promise<ApiContext | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const [profileResult, splitRoles, previewResult] = await Promise.all([
    supabase.from('profiles').select('*, organization:organizations(name, timezone)').eq('id', userId).maybeSingle(),
    supabase.from('profile_roles').select('roles(permissions, edit_permissions)').eq('profile_id', userId),
    // Set while an admin is viewing the app as another role. Errors (before the database update) mean no preview.
    supabase.from('role_previews').select('role_id, roles(name, permissions, edit_permissions)').eq('profile_id', userId).maybeSingle(),
  ]);
  // Until the view/edit database update has been run there is no edit column;
  // fall back to the old rule, where seeing a part also meant editing it.
  const rolesResult = splitRoles.error
    ? await supabase.from('profile_roles').select('roles(permissions)').eq('profile_id', userId)
    : splitRoles;
  const loaded = profileResult.data as (Profile & { organization?: { name: string; timezone: string } | null }) | null;
  if (!loaded || !loaded.is_active) return null;
  const { organization, ...profile } = loaded;
  if (organization) primeOrg(profile.org_id, organization);

  // Each row carries the joined role; tolerate either an object or a one-item list.
  const held = ((rolesResult.data ?? []) as unknown as { roles: unknown }[]).flatMap((row) =>
    (Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : []) as { permissions: string[] | null; edit_permissions?: string[] | null }[],
  );

  const realAdmin = profile.access_role === 'admin';
  const previewRow = previewResult.data as { role_id: string; roles: unknown } | null;
  const previewRole = (Array.isArray(previewRow?.roles) ? previewRow?.roles[0] : previewRow?.roles) as
    | { name: string; permissions: string[] | null; edit_permissions?: string[] | null }
    | undefined;

  // Viewing as another role: the admin is treated everywhere as an employee
  // holding only that role. The database applies the same rule to the data.
  if (realAdmin && previewRow && previewRole) {
    return {
      supabase,
      userId,
      profile: { ...profile, access_role: 'employee', job_title: previewRole.name },
      segments: segmentsFromRoles([previewRole]),
      editSegments: editSegmentsFromRoles([previewRole]),
      realAdmin,
      preview: { roleId: previewRow.role_id, roleName: previewRole.name },
    };
  }

  return { supabase, userId, profile, segments: segmentsFromRoles(held), editSegments: editSegmentsFromRoles(held), realAdmin };
});

export const crud = makeCrud(getApiContext);

export function requireContext(access: Access) {
  return authorize(getApiContext, access);
}

/**
 * For hand-written write routes: admins apply the change, people whose roles
 * include one of the segments have it stored as a change request (mode 'propose').
 */
export function requireWriter(propose: readonly string[]) {
  return authorizeWrite(getApiContext, { propose });
}

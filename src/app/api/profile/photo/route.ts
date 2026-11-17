import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';

const photo = z.object({ data: z.string().startsWith('data:image/', 'Choose an image.').max(300000, 'That photo is too large.') });

// Your own profile photo, cropped and positioned in the browser before it is sent.
export async function PUT(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, photo);
  if (body.response) return body.response;
  const { error } = await ctx.supabase
    .from('profile_photos')
    .upsert({ profile_id: ctx.userId, org_id: ctx.profile.org_id, data: body.data.data, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) return fromDbError(error);
  return ok({ saved: true });
}

export async function DELETE(): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { error } = await ctx.supabase.from('profile_photos').delete().eq('profile_id', ctx.userId);
  if (error) return fromDbError(error);
  return ok({ removed: true });
}

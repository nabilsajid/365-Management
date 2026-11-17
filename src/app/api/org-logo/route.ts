import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';

const logo = z.object({ data: z.string().startsWith('data:image/', 'Choose an image.').max(400000, 'That logo is too large. Try a smaller image.') });

// Admin: the company's logo, used on invoices and in the menu.
export async function PUT(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, logo);
  if (body.response) return body.response;
  const { error } = await ctx.supabase
    .from('org_logos')
    .upsert({ org_id: ctx.profile.org_id, data: body.data.data, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
  if (error) return fromDbError(error);
  return ok({ saved: true });
}

export async function DELETE(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { error } = await ctx.supabase.from('org_logos').delete().eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ removed: true });
}

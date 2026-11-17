import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';

const logo = z.object({ data: z.string().startsWith('data:image/', 'Choose an image.').max(300000, 'That signature image is too large.') });

// Admin: the signature printed on invoices.
export async function PUT(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, logo);
  if (body.response) return body.response;
  const { error } = await ctx.supabase
    .from('org_signatures')
    .upsert({ org_id: ctx.profile.org_id, data: body.data.data, updated_at: new Date().toISOString() }, { onConflict: 'org_id' });
  if (error) return fromDbError(error);
  return ok({ saved: true });
}

export async function DELETE(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { error } = await ctx.supabase.from('org_signatures').delete().eq('org_id', ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ removed: true });
}

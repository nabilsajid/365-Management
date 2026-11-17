import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';

type RouteParams = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const salary = z.object({ monthly_amount: z.coerce.number().min(0, 'Use 0 or more.').max(100000000) });

// Admin: a person's monthly salary (the row id is the person's id).
export async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, salary);
  if (body.response) return body.response;
  const person = await ctx.supabase.from('profiles').select('id').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (!person.data) return fail(404, 'Not found.');
  const { error } = await ctx.supabase
    .from('salaries')
    .upsert({ profile_id: id, org_id: ctx.profile.org_id, monthly_amount: body.data.monthly_amount, updated_at: new Date().toISOString() }, { onConflict: 'profile_id' });
  if (error) return fromDbError(error);
  return ok({ saved: true });
}

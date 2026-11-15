import { requireWriter } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { fixedDeliverableCreate } from '@/lib/validation';

// Adds a fixed deliverable to a monthly client: "5 videos", or a named service.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, fixedDeliverableCreate);
  if (body.response) return body.response;
  const { data, error } = await ctx.supabase
    .from('project_targets')
    .insert({ ...body.data, quantity: body.data.quantity ?? null, label: body.data.label || null, org_id: ctx.profile.org_id })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}

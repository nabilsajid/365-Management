import { crud, requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { equipmentNeeds } from '@/lib/api/resources';
import { equipmentNeedCreate } from '@/lib/validation';

// Equipment roles and admins get the whole list; everyone else gets what they asked for.
export const GET = crud.collection(equipmentNeeds).GET;

// Anyone can flag something the studio urgently needs to get.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, equipmentNeedCreate);
  if (body.response) return body.response;

  const { data, error } = await ctx.supabase
    .from('equipment_needs')
    .insert({
      org_id: ctx.profile.org_id,
      requested_by: ctx.userId,
      item_name: body.data.item_name,
      quantity: body.data.quantity,
      note: body.data.note ?? null,
    })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}

import { crud, requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { broadcasts } from '@/lib/api/resources';
import { broadcastCreate } from '@/lib/validation';

// Admins get every broadcast; everyone else gets the ones they sent.
export const GET = crud.collection(broadcasts).GET;

// Anyone can send a short urgent message to the admins.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, broadcastCreate);
  if (body.response) return body.response;

  const { data, error } = await ctx.supabase
    .from('broadcasts')
    .insert({ org_id: ctx.profile.org_id, sender_id: ctx.userId, message: body.data.message })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}

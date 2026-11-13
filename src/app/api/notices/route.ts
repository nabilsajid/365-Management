import { crud, requireContext } from '@/lib/api/context';
import { fromDbError, ok, readJson } from '@/lib/api/http';
import { notices } from '@/lib/api/resources';
import { noticeExpiry } from '@/lib/domain/notices';
import { noticeCreate } from '@/lib/validation';

// Everyone gets the notices that have not expired; admins also get expired ones.
export const GET = crud.collection(notices).GET;

// Admins post a notice and choose how long it stays up.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, noticeCreate);
  if (body.response) return body.response;

  const { data, error } = await ctx.supabase
    .from('notices')
    .insert({
      org_id: ctx.profile.org_id,
      title: body.data.title,
      body: body.data.body || null,
      is_urgent: body.data.is_urgent ?? false,
      expires_at: noticeExpiry(body.data.duration, new Date()),
      created_by: ctx.userId,
    })
    .select('*')
    .single();
  if (error) return fromDbError(error);
  return ok(data, 201);
}

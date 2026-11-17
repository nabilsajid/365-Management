import { fail, ok, readJson } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientFeedbackCreate } from '@/lib/validation';

const TOKEN = /^[0-9a-f]{64}$/;

// A client approves a deliverable or asks for changes from their portal. Only
// active portals, only deliverables of that client's projects, and only so many an hour.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!TOKEN.test(token)) return fail(404, 'This link is not valid.');
  const admin = createAdminClient();
  if (!admin) return fail(503, 'The client portal is not set up yet.');
  const body = await readJson(request, clientFeedbackCreate);
  if (body.response) return body.response;

  const portal = await admin.from('client_portals').select('id, org_id, client_id').eq('token', token).eq('is_active', true).maybeSingle();
  if (!portal.data) return fail(404, 'This link has been turned off.');
  const task = await admin.from('tasks').select('id, project:projects!inner(client_id)').eq('id', body.data.task_id).eq('project.client_id', portal.data.client_id).maybeSingle();
  if (!task.data) return fail(404, 'That deliverable is not one of your projects.');

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await admin.from('client_feedback').select('id', { count: 'exact', head: true }).eq('portal_id', portal.data.id).gte('created_at', hourAgo);
  if ((recent.count ?? 0) >= 60) return fail(429, 'Too many answers in a short time. Please try again later.');

  const { error } = await admin.from('client_feedback').insert({
    org_id: portal.data.org_id,
    portal_id: portal.data.id,
    task_id: body.data.task_id,
    name: body.data.name,
    decision: body.data.decision,
    comment: body.data.comment || null,
  });
  if (error) return fail(400, 'Your answer could not be saved.');
  return ok({ saved: true }, 201);
}

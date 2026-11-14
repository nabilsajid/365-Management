import { fail, ok, readJson } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientFeedbackCreate } from '@/lib/validation';

const TOKEN = /^[0-9a-f]{64}$/;

// A client, who has no account, approves a deliverable or asks for changes
// through the project's review link. Only active links are accepted, only for
// deliverables of that project, and only so many answers an hour.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!TOKEN.test(token)) return fail(404, 'This review link is not valid.');
  const admin = createAdminClient();
  if (!admin) return fail(503, 'Client review is not set up yet.');
  const body = await readJson(request, clientFeedbackCreate);
  if (body.response) return body.response;

  const link = await admin.from('review_links').select('id, org_id, project_id').eq('token', token).eq('is_active', true).maybeSingle();
  if (!link.data) return fail(404, 'This review link has been turned off.');
  const task = await admin.from('tasks').select('id').eq('id', body.data.task_id).eq('project_id', link.data.project_id).maybeSingle();
  if (!task.data) return fail(404, 'That deliverable is not part of this project.');

  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recent = await admin.from('client_feedback').select('id', { count: 'exact', head: true }).eq('link_id', link.data.id).gte('created_at', hourAgo);
  if ((recent.count ?? 0) >= 60) return fail(429, 'Too many answers in a short time. Please try again later.');

  const { error } = await admin.from('client_feedback').insert({
    org_id: link.data.org_id,
    link_id: link.data.id,
    task_id: body.data.task_id,
    name: body.data.name,
    decision: body.data.decision,
    comment: body.data.comment || null,
  });
  if (error) return fail(400, 'Your answer could not be saved.');
  return ok({ saved: true }, 201);
}

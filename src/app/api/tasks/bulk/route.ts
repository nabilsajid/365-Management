import { after } from 'next/server';
import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { numberedTitles, planTasksFromFixed, type FixedDeliverable, type TaskKind } from '@/lib/domain/deliverables';
import { dispatchPushes } from '@/lib/server/push';
import { taskBulkCreate } from '@/lib/validation';

type Existing = { id: string; kind: string | null; title: string };

// Creates several tasks in one go, so five videos are not typed one by one:
// either copies of one task ("Video" ×5, numbered on), or every task a month
// still needs to match the client's fixed deliverables. Thumbnails are paired
// with the video of the same number. Each can then be assigned to anyone.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, taskBulkCreate);
  if (body.response) return body.response;
  const input = body.data;
  const orgId = ctx.profile.org_id;
  if (input.points_value != null && ctx.profile.access_role !== 'admin') return fail(403, 'Only an admin sets points.');

  let scope = ctx.supabase.from('tasks').select('id, kind, title').eq('project_id', input.project_id).eq('org_id', orgId);
  scope = input.month_id ? scope.eq('month_id', input.month_id) : scope.is('month_id', null);
  const existingResult = await scope;
  if (existingResult.error) return fromDbError(existingResult.error);
  const existing = (existingResult.data ?? []) as Existing[];

  let planned: { kind: TaskKind; title: string }[];
  if (input.from_fixed) {
    const fixed = await ctx.supabase.from('project_targets').select('kind, quantity, label').eq('project_id', input.project_id).eq('org_id', orgId);
    if (fixed.error) return fromDbError(fixed.error);
    planned = planTasksFromFixed((fixed.data ?? []) as FixedDeliverable[], existing);
    if (planned.length === 0) return ok({ created: 0 }, 200);
  } else {
    if (!input.kind || !input.title) return fail(400, 'Choose a type and a title.');
    const ofKind = existing.filter((task) => (task.kind ?? 'other') === input.kind).length;
    planned = numberedTitles(input.title, input.count, ofKind).map((title) => ({ kind: input.kind as TaskKind, title }));
  }

  const start = existing.length;
  const rows = planned.map((task, index) => ({
    org_id: orgId,
    project_id: input.project_id,
    month_id: input.month_id ?? null,
    kind: task.kind,
    title: task.title,
    assignee_id: input.assignee_id ?? null,
    due_date: input.due_date ?? null,
    description: input.description || null,
    points_value: input.points_value ?? null,
    position: start + index,
  }));
  const saved = await ctx.supabase.from('tasks').insert(rows).select('id, kind, title');
  if (saved.error) return fromDbError(saved.error);

  // "Thumbnail 3" belongs to "Video 3".
  const all = [...existing, ...((saved.data ?? []) as Existing[])];
  const videoByNumber = new Map(
    all.filter((task) => task.kind === 'video').map((task) => [task.title.match(/(\d+)\s*$/)?.[1], task.id] as const).filter(([number]) => number),
  );
  for (const task of (saved.data ?? []) as Existing[]) {
    if (task.kind !== 'thumbnail') continue;
    const video = videoByNumber.get(task.title.match(/(\d+)\s*$/)?.[1]);
    if (video) await ctx.supabase.from('tasks').update({ for_task_id: video }).eq('id', task.id);
  }
  after(dispatchPushes);
  return ok({ created: rows.length }, 201);
}

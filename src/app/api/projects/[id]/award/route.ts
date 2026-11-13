import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { monthStart } from '@/lib/domain/points';
import { getOrgTimezone } from '@/lib/services/rewards';

const input = z.object({
  awards: z
    .array(z.object({ employee_id: z.string().uuid(), points: z.number().int().min(0).max(100000) }))
    .max(100),
});

// Admin gives points to the people who worked on a finished project, and the
// project leaves the "waiting for points" list. Sending no points simply closes it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const orgId = ctx.profile.org_id;
  const { id } = await params;

  const body = await readJson(request, input);
  if (body.response) return body.response;

  const found = await ctx.supabase.from('projects').select('id, name, status, points_awarded_at').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (found.error) return fromDbError(found.error);
  const project = found.data as { name: string; status: string; points_awarded_at: string | null } | null;
  if (!project) return fail(404, 'Not found.');
  if (project.status !== 'completed') return fail(409, 'Points are given once the project is marked completed.');
  if (project.points_awarded_at) return fail(409, 'Points were already given for this project.');
  const reason = `Project completed: ${project.name}`;

  const month = monthStart(new Date(), await getOrgTimezone(ctx.supabase, orgId));
  const rows = body.data.awards
    .filter((award) => award.points > 0)
    .map((award) => ({
      org_id: orgId,
      employee_id: award.employee_id,
      period_month: month,
      points: award.points,
      source: 'adjustment',
      reason,
      created_by: ctx.userId,
    }));
  if (rows.length > 0) {
    const given = await ctx.supabase.from('point_entries').insert(rows);
    if (given.error) return fromDbError(given.error);
  }

  const closed = await ctx.supabase.from('projects').update({ points_awarded_at: new Date().toISOString() }).eq('id', id).eq('org_id', orgId);
  if (closed.error) return fromDbError(closed.error);
  return ok({ given: rows.length });
}

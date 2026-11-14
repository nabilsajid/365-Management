import { after } from 'next/server';
import { requireWriter } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { nextMonthStart } from '@/lib/domain/deliverables';
import { monthStart } from '@/lib/domain/points';
import { dispatchPushes } from '@/lib/server/push';
import { getOrgTimezone } from '@/lib/services/rewards';
import { monthOpen } from '@/lib/validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Opens a month of a monthly project (this month, next month, or a chosen one)
// with the package's deliverables. Opening one that exists just returns it.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireWriter(['projects']);
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const body = await readJson(request, monthOpen);
  if (body.response) return body.response;
  const current = monthStart(new Date(), await getOrgTimezone(ctx.supabase, ctx.profile.org_id));
  const month = body.data.month === 'current' ? current : body.data.month === 'next' ? nextMonthStart(current) : `${body.data.month}-01`;
  const { data, error } = await ctx.supabase.rpc('open_project_month', { p_project: id, p_month: month });
  if (error) return fromDbError(error);
  after(dispatchPushes);
  return ok({ id: data, month }, 201);
}

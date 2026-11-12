import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { parseMonth } from '@/lib/domain/points';
import { bonusCalculate } from '@/lib/validation';

// Proposes bonuses for a finished month. Each one stays pending until an admin
// approves it; already decided bonuses are left alone.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;

  const body = await readJson(request, bonusCalculate);
  if (body.response) return body.response;
  const month = parseMonth(body.data.month);
  if (!month) return fail(400, 'month must look like YYYY-MM.');

  const { data, error } = await ctx.supabase.rpc('calculate_bonuses', { p_month: month });
  if (error) return fromDbError(error);
  return ok(data);
}

import { requireContext } from '@/lib/api/context';
import { fail, ok } from '@/lib/api/http';
import { backUpCompany } from '@/lib/server/backups';
import { createAdminClient } from '@/lib/supabase/admin';

// Admin: take a backup now (one is also taken every week by itself).
export async function POST(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const admin = createAdminClient();
  if (!admin) return fail(503, 'The service key is not set.');
  const id = await backUpCompany(admin, auth.ctx.profile.org_id);
  if (!id) return fail(500, 'The backup could not be saved. Try again in a minute.');
  return ok({ id }, 201);
}

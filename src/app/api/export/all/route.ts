import { requireContext } from '@/lib/api/context';
import { excelDownload } from '@/lib/server/backups';
import { collectCompanyData } from '@/lib/server/full-export';

// Admin: everything the company has recorded, as one Excel file with a sheet per kind of record.
export async function GET(): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const data = await collectCompanyData(ctx.supabase, ctx.profile.org_id);
  const { data: org } = await ctx.supabase.from('organizations').select('name').eq('id', ctx.profile.org_id).maybeSingle();
  const today = new Date().toISOString().slice(0, 10);
  return excelDownload(data, `${(org as { name?: string } | null)?.name ?? 'UniDock'}-everything-${today}.xlsx`);
}

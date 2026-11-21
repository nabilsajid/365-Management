import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';
import { excelDownload } from '@/lib/server/backups';
import type { ExportData } from '@/lib/server/full-export';

// Admin: download a backup as Excel.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { id } = await params;
  const { data, error } = await auth.ctx.supabase.from('backups').select('data, created_at').eq('id', id).eq('org_id', auth.ctx.profile.org_id).maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(404, 'That backup was not found.');
  const row = data as { data: ExportData; created_at: string };
  return excelDownload(row.data, `backup-${row.created_at.slice(0, 10)}.xlsx`);
}

// Admin: remove a backup.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { id } = await params;
  const { error } = await auth.ctx.supabase.from('backups').delete().eq('id', id).eq('org_id', auth.ctx.profile.org_id);
  if (error) return fromDbError(error);
  return ok({ deleted: true });
}

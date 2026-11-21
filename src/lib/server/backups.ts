import type { SupabaseClient } from '@supabase/supabase-js';
import { collectCompanyData, exportSheets, rowCount, type ExportData } from '@/lib/server/full-export';
import { workbook } from '@/lib/server/xlsx';

const KEEP = 8;
const WEEK = 7 * 86400000;

/** Takes a copy of one company's records now, and keeps only the latest eight. */
export async function backUpCompany(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const data = await collectCompanyData(admin, orgId);
  const { data: row, error } = await admin.from('backups').insert({ org_id: orgId, data, rows: rowCount(data) }).select('id').single();
  if (error) return null;
  const { data: old } = await admin.from('backups').select('id').eq('org_id', orgId).order('created_at', { ascending: false }).range(KEEP, KEEP + 100);
  const ids = ((old ?? []) as { id: string }[]).map((item) => item.id);
  if (ids.length > 0) await admin.from('backups').delete().in('id', ids);
  return (row as { id: string }).id;
}

/** Weekly: every company whose latest backup is a week old (or that has none) gets a new one. */
export async function weeklyBackups(admin: SupabaseClient): Promise<number> {
  const { data: orgs, error } = await admin.from('organizations').select('id');
  if (error) return 0;
  let made = 0;
  for (const org of (orgs ?? []) as { id: string }[]) {
    const { data: last, error: lastError } = await admin.from('backups').select('created_at').eq('org_id', org.id).order('created_at', { ascending: false }).limit(1);
    if (lastError) return made;
    const latest = (last ?? [])[0] as { created_at: string } | undefined;
    if (latest && Date.now() - Date.parse(latest.created_at) < WEEK - 3600000) continue;
    if (await backUpCompany(admin, org.id)) made += 1;
  }
  return made;
}

/** An Excel file of a company's records, as a download response. */
export function excelDownload(data: ExportData, file: string): Response {
  const bytes = workbook(exportSheets(data));
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.replace(/[^\w.-]+/g, '-')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

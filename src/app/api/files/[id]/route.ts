import { NextResponse } from 'next/server';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok } from '@/lib/api/http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = 'deliverables';

// Opens an uploaded file: a short-lived private link, so files are never public.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const file = await ctx.supabase.from('task_files').select('path, name').eq('id', id).eq('org_id', ctx.profile.org_id).maybeSingle();
  if (file.error) return fromDbError(file.error);
  if (!file.data) return fail(404, 'Not found.');
  const download = new URL(request.url).searchParams.has('download');
  const signed = await ctx.supabase.storage
    .from(BUCKET)
    .createSignedUrl(file.data.path as string, 60 * 10, download ? { download: file.data.name as string } : undefined);
  if (signed.error || !signed.data) return fail(404, 'The file could not be found in storage.');
  return NextResponse.redirect(signed.data.signedUrl, 302);
}

// The uploader or an admin removes a file, from the list and from storage.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireContext('member');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const { id } = await params;
  if (!UUID.test(id)) return fail(404, 'Not found.');
  const { data, error } = await ctx.supabase
    .from('task_files')
    .delete()
    .eq('id', id)
    .eq('org_id', ctx.profile.org_id)
    .select('path')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(403, 'You can only remove files you uploaded.');
  await ctx.supabase.storage.from(BUCKET).remove([data.path as string]);
  return ok({ deleted: true });
}

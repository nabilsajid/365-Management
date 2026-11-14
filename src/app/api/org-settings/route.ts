import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { readInvoiceOptions, storeInvoiceOptions } from '@/lib/domain/invoice-options';
import { orgRulesUpdate } from '@/lib/validation';

// Admin: company rules (the amount under which costs skip approval, how long the delete log keeps
// entries) and what invoices show.
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, orgRulesUpdate);
  if (body.response) return body.response;
  if (Object.keys(body.data).length === 0) return fail(400, 'Nothing to update.');
  const { invoice_options: invoiceOptions, ...rules } = body.data;
  const changes: Record<string, unknown> = { ...rules };
  // Only known parts are stored.
  if (invoiceOptions) changes.invoice_options = storeInvoiceOptions(readInvoiceOptions(invoiceOptions));
  const { data, error } = await ctx.supabase
    .from('organizations')
    .update(changes)
    .eq('id', ctx.profile.org_id)
    .select('id')
    .maybeSingle();
  if (error) return fromDbError(error);
  if (!data) return fail(403, 'Only an admin can change the rules.');
  return ok(data);
}

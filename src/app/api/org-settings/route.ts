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
  const { invoice_options: invoiceOptions, reminders, hidden_sections: hiddenSections, ...rules } = body.data;
  const changes: Record<string, unknown> = { ...rules };
  // Empty company details are stored as nothing.
  for (const key of ['contact_address', 'contact_phone', 'contact_email', 'website', 'trade_license'] as const) {
    if (key in changes) changes[key] = (changes[key] as string | null | undefined) || null;
  }
  // Only known parts are stored.
  if (invoiceOptions) changes.invoice_options = storeInvoiceOptions(readInvoiceOptions(invoiceOptions));
  // Reminders and menu sections live together in settings; the rest of it is kept.
  if (reminders || hiddenSections) {
    const current = await ctx.supabase.from('organizations').select('settings').eq('id', ctx.profile.org_id).maybeSingle();
    if (current.error) return fromDbError(current.error);
    const settings = { ...((current.data?.settings as Record<string, unknown> | null) ?? {}) };
    if (reminders) settings.reminders = { ...((settings.reminders as Record<string, unknown>) ?? {}), ...reminders };
    if (hiddenSections) settings.hidden_sections = hiddenSections;
    changes.settings = settings;
  }
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

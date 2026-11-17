import { z } from 'zod';
import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { OPTIONAL_SECTIONS, SECTION_LABEL, hiddenSections, type OptionalSection } from '@/lib/domain/sections';
import { createAdminClient } from '@/lib/supabase/admin';

const featureChange = z.object({
  feature: z.enum(OPTIONAL_SECTIONS),
  on: z.boolean(),
  // Switching off can also remove the feature's data, after typing its name.
  delete_data: z.boolean().optional(),
  confirm: z.string().optional(),
});

/** The tables cleared when a feature is switched off with its data, children first. */
const DATA: Partial<Record<(typeof OPTIONAL_SECTIONS)[number], string[]>> = {
  '/leave': ['leave_requests'],
  '/logistics': ['equipment_checkouts', 'equipment_needs', 'equipment'],
  points: ['point_entries', 'bonuses', 'attendance'],
};

// Admin: switch a feature on or off for the whole company.
export async function PATCH(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const body = await readJson(request, featureChange);
  if (body.response) return body.response;
  const { on, delete_data: deleteData, confirm } = body.data;
  const feature = body.data.feature as OptionalSection;
  const orgId = ctx.profile.org_id;

  if (!on && deleteData) {
    if ((confirm ?? '').trim().toLowerCase() !== SECTION_LABEL[feature].toLowerCase()) {
      return fail(400, `Type "${SECTION_LABEL[feature]}" to confirm deleting its data.`);
    }
    const admin = createAdminClient();
    if (!admin) return fail(501, 'Deleting data needs SUPABASE_SERVICE_ROLE_KEY on the server.');
    for (const table of DATA[feature] ?? []) {
      const { error } = await admin.from(table).delete().eq('org_id', orgId);
      if (error) return fromDbError(error);
    }
  }

  const current = await ctx.supabase.from('organizations').select('settings').eq('id', orgId).maybeSingle();
  if (current.error) return fromDbError(current.error);
  const settings = { ...((current.data?.settings as Record<string, unknown> | null) ?? {}) };
  const hidden = new Set(hiddenSections(settings));
  if (on) hidden.delete(feature);
  else hidden.add(feature);
  settings.hidden_sections = [...hidden];
  const { error } = await ctx.supabase.from('organizations').update({ settings }).eq('id', orgId);
  if (error) return fromDbError(error);
  return ok({ hidden: [...hidden] });
}

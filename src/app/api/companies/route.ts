import { requireContext } from '@/lib/api/context';
import { fail, fromDbError, ok, readJson } from '@/lib/api/http';
import { createAdminClient } from '@/lib/supabase/admin';
import { companyCreate } from '@/lib/validation';

async function requireOwner() {
  const auth = await requireContext('member');
  if (auth.response) return auth;
  if (!auth.ctx.owner) return { response: fail(403, 'Only the owner of the app can manage companies.') };
  return auth;
}

// Owner: every company in the app, with how many people each has.
export async function GET(): Promise<Response> {
  const auth = await requireOwner();
  if (auth.response) return auth.response;
  const admin = createAdminClient();
  if (!admin) return fail(501, 'Managing companies needs SUPABASE_SERVICE_ROLE_KEY on the server.');
  const [orgs, people] = await Promise.all([
    admin.from('organizations').select('id, name, timezone, currency, created_at').order('created_at'),
    admin.from('profiles').select('org_id, is_active'),
  ]);
  if (orgs.error) return fromDbError(orgs.error);
  const counts = new Map<string, number>();
  for (const row of (people.data ?? []) as { org_id: string; is_active: boolean }[]) {
    if (row.is_active) counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  }
  return ok(((orgs.data ?? []) as { id: string }[]).map((org) => ({ ...org, people: counts.get(org.id) ?? 0 })));
}

// Owner: a new company with its first admin, who can then add their own team.
// The company starts empty, with the standard roles and point rules, its logo,
// and only the features chosen in the setup steps.
export async function POST(request: Request): Promise<Response> {
  const auth = await requireOwner();
  if (auth.response) return auth.response;
  const body = await readJson(request, companyCreate);
  if (body.response) return body.response;
  const admin = createAdminClient();
  if (!admin) return fail(501, 'Adding companies needs SUPABASE_SERVICE_ROLE_KEY on the server.');
  const input = body.data;

  const org = await admin
    .from('organizations')
    .insert({
      name: input.name,
      timezone: input.timezone,
      currency: input.currency,
      trade_license: input.trade_license || null,
      settings: { hidden_sections: input.hidden_sections ?? [] },
    })
    .select('id')
    .single();
  if (org.error) return fromDbError(org.error);
  const orgId = org.data.id as string;
  if (input.logo_data) await admin.from('org_logos').insert({ org_id: orgId, data: input.logo_data });

  const made = await admin.auth.admin.createUser({ email: input.admin_email, password: input.admin_password, email_confirm: true });
  if (made.error || !made.data.user) {
    await admin.from('organizations').delete().eq('id', orgId);
    return fail(400, made.error?.message ?? 'The admin account could not be created.');
  }
  const profile = await admin
    .from('profiles')
    .insert({ id: made.data.user.id, org_id: orgId, full_name: input.admin_name, access_role: 'admin', job_title: 'Admin' })
    .select('id')
    .single();
  if (profile.error) {
    await admin.auth.admin.deleteUser(made.data.user.id);
    await admin.from('organizations').delete().eq('id', orgId);
    return fromDbError(profile.error);
  }
  // Best effort: give them the company's Admin role tag, so their name shows it.
  const role = await admin.from('roles').select('id').eq('org_id', orgId).ilike('name', 'admin').limit(1).maybeSingle();
  if (role.data) await admin.from('profile_roles').insert({ org_id: orgId, profile_id: made.data.user.id, role_id: role.data.id });
  return ok({ id: orgId, name: input.name }, 201);
}

// Creates the demo organization, its admin user and the demo employees listed
// in scripts/demo-team.json. Safe to run again: existing people are updated.
//   npm run seed:demo
// Reads from .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// DEMO_USER_EMAIL, DEMO_USER_PASSWORD, optionally DEMO_ORG_NAME, and
// DEMO_EMPLOYEE_PASSWORD (the shared password for the demo employees; they are
// skipped when it is not set).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import team from './demo-team.json';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.DEMO_USER_EMAIL;
const adminPassword = process.env.DEMO_USER_PASSWORD;
const employeePassword = process.env.DEMO_EMPLOYEE_PASSWORD;
const orgName = process.env.DEMO_ORG_NAME || 'Demo Studio';

interface RoleRow {
  id: string;
  name: string;
  is_admin: boolean;
}

async function ensureUser(
  supabase: SupabaseClient,
  known: Map<string, string>,
  email: string,
  password: string,
): Promise<string> {
  const existing = known.get(email.toLowerCase());
  if (existing) return existing;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    throw new Error(`Could not create ${email}: ${created.error?.message ?? 'unknown error'}`);
  }
  return created.data.user.id;
}

/** Creates or updates the profile and gives the person the role. Existing extra roles are kept. */
async function ensurePerson(supabase: SupabaseClient, orgId: string, id: string, fullName: string, role: RoleRow) {
  const existing = await supabase.from('profiles').select('id').eq('id', id).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  const saved = existing.data
    ? await supabase.from('profiles').update({ full_name: fullName, is_active: true }).eq('id', id)
    : await supabase.from('profiles').insert({ id, org_id: orgId, full_name: fullName });
  if (saved.error) throw new Error(`${fullName}: ${saved.error.message}`);

  const tagged = await supabase.from('profile_roles').upsert({ profile_id: id, role_id: role.id, org_id: orgId });
  if (tagged.error) throw new Error(`${fullName}: ${tagged.error.message}`);
}

async function main() {
  if (!url || !serviceKey || !adminEmail || !adminPassword) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_EMAIL and DEMO_USER_PASSWORD in .env.local first.',
    );
  }
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Organization (creating it also creates the starting roles)
  const existingOrg = await supabase.from('organizations').select('id').eq('name', orgName).limit(1).maybeSingle();
  if (existingOrg.error) throw new Error(existingOrg.error.message);
  let orgId = existingOrg.data?.id as string | undefined;
  if (!orgId) {
    const created = await supabase.from('organizations').insert({ name: orgName }).select('id').single();
    if (created.error) throw new Error(created.error.message);
    orgId = created.data.id as string;
  }

  const rolesResult = await supabase.from('roles').select('id, name, is_admin').eq('org_id', orgId);
  if (rolesResult.error) {
    throw new Error(`Could not read roles (${rolesResult.error.message}). Apply every file in supabase/migrations first.`);
  }
  const roles = (rolesResult.data ?? []) as RoleRow[];
  const adminRole = roles.find((role) => role.is_admin);
  if (!adminRole) throw new Error('This organization has no Admin role. Apply every file in supabase/migrations first.');

  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error(listed.error.message);
  const known = new Map<string, string>();
  for (const user of listed.data.users) if (user.email) known.set(user.email.toLowerCase(), user.id);

  // Admin
  const adminId = await ensureUser(supabase, known, adminEmail, adminPassword);
  await ensurePerson(supabase, orgId, adminId, team.admin.full_name, adminRole);
  console.log(`Admin ready: ${team.admin.full_name} (${adminRole.name}) in "${orgName}".`);

  // Demo employees
  if (!employeePassword) {
    console.log(`Skipped ${team.employees.length} demo employees: DEMO_EMPLOYEE_PASSWORD is not set in .env.local.`);
    return;
  }
  for (const person of team.employees) {
    const role = roles.find((candidate) => candidate.name === person.job_title);
    if (!role) throw new Error(`There is no role named "${person.job_title}" (${person.full_name}).`);
    const id = await ensureUser(supabase, known, person.email, employeePassword);
    await ensurePerson(supabase, orgId, id, person.full_name, role);
    console.log(`Employee ready: ${person.full_name} (${role.name}).`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

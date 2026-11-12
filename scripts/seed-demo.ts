// Creates the demo organization, its admin user and the demo employees listed
// in scripts/demo-team.json. Safe to run again: existing people are updated.
//   npm run seed:demo
// Reads from .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// DEMO_USER_EMAIL, DEMO_USER_PASSWORD, optionally DEMO_ORG_NAME, and
// DEMO_EMPLOYEE_PASSWORD (the shared password for the demo employees; they are
// skipped when it is not set).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ADMIN_ROLE, accessForRole, isJobRole } from '../src/lib/domain/roles';
import team from './demo-team.json';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = process.env.DEMO_USER_EMAIL;
const adminPassword = process.env.DEMO_USER_PASSWORD;
const employeePassword = process.env.DEMO_EMPLOYEE_PASSWORD;
const orgName = process.env.DEMO_ORG_NAME || 'Demo Studio';

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

async function main() {
  if (!url || !serviceKey || !adminEmail || !adminPassword) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_EMAIL and DEMO_USER_PASSWORD in .env.local first.',
    );
  }
  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  // Organization
  const existingOrg = await supabase.from('organizations').select('id').eq('name', orgName).limit(1).maybeSingle();
  if (existingOrg.error) throw new Error(existingOrg.error.message);
  let orgId = existingOrg.data?.id as string | undefined;
  if (!orgId) {
    const created = await supabase.from('organizations').insert({ name: orgName }).select('id').single();
    if (created.error) throw new Error(created.error.message);
    orgId = created.data.id as string;
  }

  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listed.error) throw new Error(listed.error.message);
  const known = new Map<string, string>();
  for (const user of listed.data.users) if (user.email) known.set(user.email.toLowerCase(), user.id);

  // Admin
  const adminId = await ensureUser(supabase, known, adminEmail, adminPassword);
  const adminProfile = await supabase.from('profiles').upsert({
    id: adminId,
    org_id: orgId,
    full_name: team.admin.full_name,
    job_title: ADMIN_ROLE,
    access_role: 'admin',
    is_active: true,
  });
  if (adminProfile.error) throw new Error(adminProfile.error.message);
  console.log(`Admin ready: ${team.admin.full_name} (${ADMIN_ROLE}) in "${orgName}".`);

  // Demo employees
  if (!employeePassword) {
    console.log(`Skipped ${team.employees.length} demo employees: DEMO_EMPLOYEE_PASSWORD is not set in .env.local.`);
    return;
  }
  for (const person of team.employees) {
    if (!isJobRole(person.job_title)) throw new Error(`"${person.job_title}" is not a known role (${person.full_name}).`);
    const id = await ensureUser(supabase, known, person.email, employeePassword);
    const profile = await supabase.from('profiles').upsert({
      id,
      org_id: orgId,
      full_name: person.full_name,
      job_title: person.job_title,
      access_role: accessForRole(person.job_title),
      is_active: true,
    });
    if (profile.error) throw new Error(`${person.full_name}: ${profile.error.message}`);
    console.log(`Employee ready: ${person.full_name} (${person.job_title}).`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

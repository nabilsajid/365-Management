import Link from 'next/link';
import { ApiForm, ResourceManager } from '@/components/resource-manager';
import { PROFILE_FIELDS } from '@/components/profile-fields';
import { SetPassword } from '@/components/set-password';
import type { Field } from '@/components/types';
import { roleTags } from '@/lib/domain/roles';
import { asRows, getPageContext, options, rowsOf } from '@/lib/page';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile, ProfilePrivate, ProfileRole, Role } from '@/types/database';

const TABS = [
  { key: 'me', label: 'My profile' },
  { key: 'team', label: 'Team contacts' },
  { key: 'logins', label: 'Login details' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// One topic per tab: your own details, the team's contacts, and (admins only) login details.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: requestedTab } = await searchParams;
  const { supabase, orgId, userId, profile, isAdmin } = await getPageContext();

  // Row level security returns private details for yourself only, or for everyone if you are an admin.
  const [peopleR, privateR] = await Promise.all([
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('profile_private').select('*').eq('org_id', orgId),
  ]);

  if (!('profile_completed_at' in profile) || privateR.error) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1>Profiles</h1>
          </div>
        </div>
        <section className="panel">
          <p className="muted">
            Profiles need a database update first. An admin has to run the file
            <code> 20261112000013_profiles_notices.sql </code>
            in the Supabase SQL Editor, then reload this page.
          </p>
        </section>
      </>
    );
  }

  const tabs = TABS.filter((item) => item.key !== 'logins' || isAdmin);
  const tab: Tab = tabs.some((item) => item.key === requestedTab) ? (requestedTab as Tab) : 'me';

  // Login IDs (sign-in emails) live in Supabase Auth and are shown to admins only.
  const emails = new Map<string, string>();
  if (isAdmin && tab !== 'me') {
    const listed = await createAdminClient()?.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const user of listed?.data?.users ?? []) if (user.email) emails.set(user.id, user.email);
  }

  // Admins manage people on the team tab, so it also needs the roles.
  const manages = isAdmin && tab === 'team';
  const [rolesR, heldR] = manages
    ? await Promise.all([
        supabase.from('roles').select('*').eq('org_id', orgId).order('name'),
        supabase.from('profile_roles').select('*').eq('org_id', orgId),
      ])
    : [{ data: [] }, { data: [] }];
  const roles = rowsOf<Role>(rolesR.data);
  const held = rowsOf<ProfileRole>(heldR.data);
  const roleName = new Map(roles.map((role) => [role.id, role.name]));
  const roleColor = new Map(roles.map((role) => [role.name, role.color]));

  const details = new Map(rowsOf<ProfilePrivate>(privateR.data).map((row) => [row.profile_id, row]));
  const mine = details.get(userId);

  const people = rowsOf<Profile>(peopleR.data)
    .filter((person) => isAdmin || person.is_active)
    .map((person) => ({
      id: person.id,
      full_name: person.full_name,
      nickname: person.nickname ?? null,
      job_title: person.job_title ?? '—',
      contact: person.contact ?? null,
      address: details.get(person.id)?.address ?? null,
      secondary_contact: details.get(person.id)?.secondary_contact ?? null,
      filled: Boolean(person.profile_completed_at),
      is_active: person.is_active,
      is_admin: person.access_role === 'admin',
      email: emails.get(person.id) ?? null,
      standing: person.is_active ? 'active' : 'suspended',
      role_ids: held.filter((row) => row.profile_id === person.id).map((row) => row.role_id),
    }))
    .map((person) => ({ ...person, role_names: roleTags(person.role_ids.map((id) => roleName.get(id)), roleColor) }));

  const roleField: Field = {
    name: 'role_ids',
    label: 'Roles',
    type: 'multiselect',
    required: true,
    options: options(roles, (role) => role.name),
    hint: 'Pick one or more. A person sees everything any of their roles allows.',
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Profiles</h1>
          <p className="muted">Your own details, and how to reach everyone on the team.</p>
        </div>
      </div>

      <nav className="tabs" aria-label="Profile sections">
        {tabs.map((item) => (
          <Link key={item.key} href={`/profile?tab=${item.key}`} aria-current={tab === item.key ? 'page' : undefined}>
            {item.key === 'team' && isAdmin ? 'Everyone’s profiles' : item.label}
          </Link>
        ))}
      </nav>

      {tab === 'me' ? (
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>My profile</h2>
            <p className="muted">
              Your name, designation and contact number are visible to the team. Your address and secondary contact are
              visible only to you and the admins.
            </p>
          </div>
        </header>
        <ApiForm
          endpoint="/api/profile"
          method="PATCH"
          submitLabel="Save profile"
          resetOnSuccess={false}
          fields={PROFILE_FIELDS}
          initial={{
            full_name: profile.full_name,
            nickname: profile.nickname ?? null,
            contact: profile.contact ?? null,
            secondary_contact: mine?.secondary_contact ?? null,
            address: mine?.address ?? null,
          }}
        />
      </section>
      ) : null}

      {tab === 'team' && isAdmin ? (
        <ResourceManager
          title="Everyone’s profiles"
          description="Add a person, change any of their details, suspend them so they cannot sign in, or delete them. Deleting also removes their points, attendance and bonuses for good; suspend instead to keep the history."
          endpoint="/api/employees"
          rows={asRows(people)}
          columns={[
            { key: 'full_name', label: 'Name' },
            { key: 'role_names', label: 'Roles', kind: 'tags' },
            { key: 'email', label: 'Login email' },
            { key: 'contact', label: 'Contact' },
            { key: 'secondary_contact', label: 'Secondary contact' },
            { key: 'address', label: 'Address' },
            { key: 'standing', label: 'Status', kind: 'label' },
          ]}
          fields={[
            { name: 'full_name', label: 'Full name', required: true },
            { name: 'email', label: 'Login email', type: 'email', required: true, hint: 'They sign in with this.' },
            { name: 'password', label: 'Password', hint: 'Optional. Leave empty and one is chosen for you; find it under Login details.' },
            roleField,
          ]}
          editFields={[
            { name: 'full_name', label: 'Full name', required: true },
            { name: 'email', label: 'Login email', type: 'email', required: true },
            { name: 'nickname', label: 'Nickname' },
            { name: 'contact', label: 'Contact number' },
            { name: 'secondary_contact', label: 'Secondary contact' },
            { name: 'address', label: 'Address', type: 'textarea' },
            roleField,
            { name: 'is_active', label: 'Allowed to sign in (untick to suspend)', type: 'checkbox' },
          ]}
          canWrite
          addLabel="Add employee"
          emptyText="No one here yet."
          pageSize={25}
        />
      ) : null}

      {tab === 'team' && !isAdmin ? (
        <ResourceManager
          title="Team contacts"
          description="Name, designation and contact number of everyone on the team."
          endpoint="/api/employees"
          rows={asRows(people)}
          columns={[
            { key: 'full_name', label: 'Name' },
            { key: 'job_title', label: 'Designation' },
            { key: 'contact', label: 'Contact' },
          ]}
          emptyText="No one here yet."
          pageSize={25}
        />
      ) : null}

      {isAdmin && tab === 'logins' ? (
        <SetPassword
          people={people
            .filter((person) => person.is_active)
            .map((person) => ({ value: person.id, label: person.job_title === '—' ? person.full_name : `${person.full_name} (${person.job_title})` }))}
          logins={people.map((person) => ({
            id: person.id,
            name: person.full_name,
            role: person.job_title === '—' ? null : person.job_title,
            loginId: emails.get(person.id) ?? null,
            isAdmin: person.is_admin,
          }))}
        />
      ) : null}
    </>
  );
}

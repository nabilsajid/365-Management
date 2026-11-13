import Link from 'next/link';
import { ApiForm, ResourceManager } from '@/components/resource-manager';
import { PROFILE_FIELDS } from '@/components/profile-fields';
import { SetPassword } from '@/components/set-password';
import { asRows, getPageContext, rowsOf } from '@/lib/page';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Profile, ProfilePrivate } from '@/types/database';

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
  if (isAdmin && tab === 'logins') {
    const listed = await createAdminClient()?.auth.admin.listUsers({ page: 1, perPage: 1000 });
    for (const user of listed?.data?.users ?? []) if (user.email) emails.set(user.id, user.email);
  }

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
    }));

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

      {tab === 'team' ? (
      <ResourceManager
        title={isAdmin ? 'Everyone’s profiles' : 'Team contacts'}
        description={
          isAdmin
            ? 'You can see and edit every detail. The rest of the team sees only name, designation and contact number.'
            : 'Name, designation and contact number of everyone on the team.'
        }
        endpoint="/api/profile"
        rows={asRows(people)}
        columns={
          isAdmin
            ? [
                { key: 'full_name', label: 'Name' },
                { key: 'nickname', label: 'Nickname' },
                { key: 'job_title', label: 'Designation' },
                { key: 'contact', label: 'Contact' },
                { key: 'secondary_contact', label: 'Secondary contact' },
                { key: 'address', label: 'Address' },
                { key: 'filled', label: 'Filled in', kind: 'bool' },
              ]
            : [
                { key: 'full_name', label: 'Name' },
                { key: 'job_title', label: 'Designation' },
                { key: 'contact', label: 'Contact' },
              ]
        }
        editFields={PROFILE_FIELDS}
        canWrite={isAdmin}
        allowCreate={false}
        allowDelete={false}
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

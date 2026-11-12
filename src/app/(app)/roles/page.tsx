import { redirect } from 'next/navigation';
import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { ROLE_COLORS, SEGMENTS, roleTags, segmentLabel } from '@/lib/domain/roles';
import { asRows, getPageContext, options, rowsOf } from '@/lib/page';
import type { Profile, ProfileRole, Role } from '@/types/database';

// Admin only: create and edit roles, choose what each can see, and give roles to people.
export default async function RolesPage() {
  const { supabase, orgId, isAdmin } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');

  const [rolesR, heldR, peopleR] = await Promise.all([
    supabase.from('roles').select('*').eq('org_id', orgId).order('name'),
    supabase.from('profile_roles').select('*').eq('org_id', orgId),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
  ]);
  const roles = rowsOf<Role>(rolesR.data);
  const held = rowsOf<ProfileRole>(heldR.data);
  const people = rowsOf<Profile>(peopleR.data);

  const roleName = new Map(roles.map((role) => [role.id, role.name]));
  const roleColor = new Map(roles.map((role) => [role.name, role.color]));
  const personName = new Map(people.map((profile) => [profile.id, profile.full_name]));

  const roleRows = roles.map((role) => {
    const holders = held.filter((row) => row.role_id === role.id).map((row) => personName.get(row.profile_id) ?? '');
    return {
      ...role,
      tag: [{ label: role.name, color: role.color }],
      sees: role.is_admin ? ['Everything, with full editing'] : role.permissions.map(segmentLabel),
      holder_names: holders.filter(Boolean).sort(),
    };
  });
  const peopleRows = people.map((profile) => {
    const ids = held.filter((row) => row.profile_id === profile.id).map((row) => row.role_id);
    return { ...profile, role_ids: ids, role_names: roleTags(ids.map((id) => roleName.get(id)), roleColor) };
  });

  const roleFields: Field[] = [
    { name: 'name', label: 'Role name', required: true, placeholder: 'Content Writer' },
    { name: 'description', label: 'Description' },
    {
      name: 'color',
      label: 'Label colour',
      type: 'select',
      required: true,
      defaultValue: 'blue',
      options: ROLE_COLORS.map((color) => ({ value: color, label: color.charAt(0).toUpperCase() + color.slice(1) })),
    },
    {
      name: 'permissions',
      label: 'What this role can see',
      type: 'multiselect',
      options: SEGMENTS.map((segment) => ({ value: segment.key, label: segment.label })),
      hint: 'Leave everything off for a role that only sees its own tasks, points and equipment. Holders can also edit these parts, but each change waits for an admin to approve it.',
    },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Roles &amp; Access</h1>
          <p className="muted">Create roles, decide what each one can see, and give people one or more roles.</p>
        </div>
      </div>

      <ResourceManager
        title="Roles"
        description="Use Edit to rename a role, change its label colour or change what it can see. The Admin role always has full access and cannot be deleted."
        endpoint="/api/roles"
        rows={asRows(roleRows)}
        columns={[
          { key: 'tag', label: 'Role', kind: 'tags' },
          { key: 'description', label: 'Description' },
          { key: 'sees', label: 'Can see', kind: 'tags' },
          { key: 'holder_names', label: 'Held by', kind: 'tags' },
        ]}
        fields={roleFields}
        canWrite
        addLabel="Create role"
        emptyText="No roles found. If this stays empty, the database update for roles has not been run yet."
      />

      <ResourceManager
        title="People and their roles"
        description="Use Edit to add or remove a person's roles. A person can hold several."
        endpoint="/api/employees"
        rows={asRows(peopleRows)}
        columns={[
          { key: 'full_name', label: 'Name' },
          { key: 'role_names', label: 'Roles', kind: 'tags' },
          { key: 'is_active', label: 'Active', kind: 'bool' },
        ]}
        editFields={[
          {
            name: 'role_ids',
            label: 'Roles',
            type: 'multiselect',
            required: true,
            options: options(roles, (role) => role.name),
          },
        ]}
        canWrite
        allowDelete={false}
      />

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>What each part opens</h2>
          </div>
        </header>
        <dl className="detail">
          {SEGMENTS.map((segment) => (
            <div key={segment.key} className="contents">
              <dt>{segment.label}</dt>
              <dd>{segment.description}</dd>
            </div>
          ))}
        </dl>
      </section>
    </>
  );
}

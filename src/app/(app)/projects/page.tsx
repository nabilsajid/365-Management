import { redirect } from 'next/navigation';
import { ProjectOnboardingForm } from '@/components/project-onboarding-form';
import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { asRows, enumOptions, getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import type { Client, Profile, Project, ProjectMember, Task } from '@/types/database';

export default async function ProjectsPage() {
  const { supabase, orgId, isAdmin, can } = await getPageContext();
  if (!can('projects')) redirect('/my-tasks');

  const [clientsResult, projectsResult, tasksResult, peopleResult, membersResult] = await Promise.all([
    supabase.from('clients').select('*').eq('org_id', orgId),
    supabase.from('projects').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('tasks').select('id, project_id, status').eq('org_id', orgId),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('project_members').select('*').eq('org_id', orgId),
  ]);
  const clients = rowsOf<Client>(clientsResult.data);
  const projects = rowsOf<Project>(projectsResult.data);
  const tasks = rowsOf<Pick<Task, 'id' | 'project_id' | 'status'>>(tasksResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const members = rowsOf<ProjectMember>(membersResult.data);

  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const personName = new Map(people.map((profile) => [profile.id, profile.full_name]));
  const staff = peopleOptions(people);

  const projectRows = projects.map((project) => {
    const own = tasks.filter((task) => task.project_id === project.id);
    const approved = own.filter((task) => task.status === 'approved').length;
    const memberIds = members.filter((row) => row.project_id === project.id).map((row) => row.profile_id);
    return {
      ...project,
      client_name: project.client_id ? (clientName.get(project.client_id) ?? null) : null,
      member_ids: memberIds,
      team: memberIds.map((id) => personName.get(id) ?? '').filter(Boolean).sort(),
      progress: own.length === 0 ? 'No tasks' : `${approved} of ${own.length} approved`,
      href: `/projects/${project.id}`,
    };
  });

  const projectFields: Field[] = [
    { name: 'name', label: 'Project name', required: true },
    { name: 'client_name', label: 'Client', placeholder: 'Optional', hint: 'Type a name, or leave empty for an internal project.' },
    { name: 'status', label: 'Status', type: 'select', options: enumOptions(['onboarding', 'active', 'completed', 'archived']), required: true },
    { name: 'start_date', label: 'Start date', type: 'date' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'brief', label: 'Project brief', type: 'textarea' },
    { name: 'member_ids', label: 'Assigned employees', type: 'multiselect', options: staff },
    { name: 'file_links', label: 'Links', type: 'links' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projects</h1>
          <p className="muted">Every project, who is on it, and how far along it is.</p>
        </div>
      </div>

      <ProjectOnboardingForm people={staff} needsApproval={!isAdmin} />

      <ResourceManager
        title="All projects"
        endpoint="/api/projects"
        rows={asRows(projectRows)}
        columns={[
          { key: 'name', label: 'Project', kind: 'nav', hrefKey: 'href' },
          { key: 'client_name', label: 'Client' },
          { key: 'team', label: 'Team', kind: 'tags' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'progress', label: 'Tasks' },
          { key: 'due_date', label: 'Due' },
          { key: 'file_links', label: 'Links', kind: 'links' },
        ]}
        editFields={projectFields}
        canWrite
        needsApproval={!isAdmin}
        allowCreate={false}
        emptyText='No projects yet. Use "Add project" above to create the first one.'
      />
    </>
  );
}

import { ProjectOnboardingForm } from '@/components/project-onboarding-form';
import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { asRows, enumOptions, getPageContext, options, peopleOptions, rowsOf } from '@/lib/page';
import type { Client, Profile, Project, Task } from '@/types/database';

export default async function ProjectsPage() {
  const { supabase, orgId, isAdmin } = await getPageContext();

  const [clientsResult, projectsResult, tasksResult, peopleResult] = await Promise.all([
    supabase.from('clients').select('*').eq('org_id', orgId).order('name'),
    supabase.from('projects').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('tasks').select('id, project_id, status').eq('org_id', orgId),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
  ]);
  const clients = rowsOf<Client>(clientsResult.data);
  const projects = rowsOf<Project>(projectsResult.data);
  const tasks = rowsOf<Pick<Task, 'id' | 'project_id' | 'status'>>(tasksResult.data);
  const people = rowsOf<Profile>(peopleResult.data);

  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const clientOptions = options(clients, (client) => client.name);

  const projectRows = projects.map((project) => {
    const own = tasks.filter((task) => task.project_id === project.id);
    const approved = own.filter((task) => task.status === 'approved').length;
    return {
      ...project,
      client_name: clientName.get(project.client_id) ?? '—',
      progress: own.length === 0 ? 'No tasks' : `${approved} of ${own.length} approved`,
      href: `/projects/${project.id}`,
    };
  });

  const clientFields: Field[] = [
    { name: 'name', label: 'Client name', required: true },
    { name: 'contact_name', label: 'Contact person' },
    { name: 'email', label: 'Email', type: 'email' },
    { name: 'phone', label: 'Phone' },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const projectFields: Field[] = [
    { name: 'name', label: 'Project name', required: true },
    { name: 'client_id', label: 'Client', type: 'select', options: clientOptions, required: true },
    { name: 'status', label: 'Status', type: 'select', options: enumOptions(['onboarding', 'active', 'completed', 'archived']), required: true },
    { name: 'start_date', label: 'Start date', type: 'date' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'brief', label: 'Project brief', type: 'textarea' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Projects &amp; Clients</h1>
          <p className="muted">Client onboarding, project briefs and deliverable tasks.</p>
        </div>
      </div>

      <ResourceManager
        title="Projects"
        endpoint="/api/projects"
        rows={asRows(projectRows)}
        columns={[
          { key: 'name', label: 'Project', kind: 'nav', hrefKey: 'href' },
          { key: 'client_name', label: 'Client' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'progress', label: 'Tasks' },
          { key: 'due_date', label: 'Due' },
        ]}
        editFields={projectFields}
        canWrite={isAdmin}
        allowCreate={false}
        emptyText="No projects yet."
      />

      {isAdmin ? (
        clients.length > 0 ? (
          <ProjectOnboardingForm clients={clientOptions} people={peopleOptions(people)} />
        ) : (
          <section className="panel">
            <h2>Onboard a project</h2>
            <p className="muted">Add a client below first, then you can onboard their project here.</p>
          </section>
        )
      ) : null}

      <ResourceManager
        title="Clients"
        endpoint="/api/clients"
        rows={asRows(clients)}
        columns={[
          { key: 'name', label: 'Client' },
          { key: 'contact_name', label: 'Contact' },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'notes', label: 'Notes' },
        ]}
        fields={clientFields}
        canWrite={isAdmin}
        addLabel="Add client"
        emptyText="No clients yet."
      />
    </>
  );
}

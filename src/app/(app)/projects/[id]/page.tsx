import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { label } from '@/lib/format';
import { asRows, enumOptions, getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import type { Client, Profile, Project, Task } from '@/types/database';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, isAdmin } = await getPageContext();

  const projectResult = await supabase.from('projects').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  const project = projectResult.data as Project | null;
  if (!project) notFound();

  const [clientResult, tasksResult, peopleResult] = await Promise.all([
    supabase.from('clients').select('*').eq('id', project.client_id).maybeSingle(),
    supabase.from('tasks').select('*').eq('project_id', id).eq('org_id', orgId).order('position'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
  ]);
  const client = clientResult.data as Client | null;
  const tasks = rowsOf<Task>(tasksResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const person = new Map(people.map((profile) => [profile.id, profile]));

  const taskRows = tasks.map((task) => {
    const assignee = task.assignee_id ? person.get(task.assignee_id) : undefined;
    return {
      ...task,
      assignee_name: assignee?.full_name ?? 'Unassigned',
      assignee_role: assignee?.job_title ?? null,
      href: `/tasks/${task.id}`,
    };
  });

  const taskFields: Field[] = [
    { name: 'title', label: 'Title', required: true, placeholder: 'Video 1' },
    { name: 'assignee_id', label: 'Assignee', type: 'select', options: peopleOptions(people) },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'todo', options: enumOptions(['todo', 'in_progress', 'submitted', 'changes_requested', 'approved']) },
    { name: 'points_value', label: 'Points on approval', type: 'number', hint: 'Leave empty to use the organization default.' },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'description', label: 'Description', type: 'textarea' },
    { name: 'file_links', label: 'File links', type: 'links' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted">
            <Link href="/projects">Projects</Link> / {client?.name ?? 'Client'}
          </p>
          <h1>{project.name}</h1>
        </div>
      </div>

      <section className="panel">
        <dl className="detail">
          <dt>Client</dt>
          <dd>{client?.name ?? '—'}</dd>
          <dt>Status</dt>
          <dd>{label(project.status)}</dd>
          <dt>Dates</dt>
          <dd>
            {project.start_date ?? '—'} to {project.due_date ?? '—'}
          </dd>
          <dt>Brief</dt>
          <dd>{project.brief ?? 'No brief written yet.'}</dd>
        </dl>
      </section>

      <ResourceManager
        title="Deliverables"
        description="One task per deliverable, each with its own description, file links and assignee."
        endpoint="/api/tasks"
        rows={asRows(taskRows)}
        columns={[
          { key: 'title', label: 'Task', kind: 'nav', hrefKey: 'href' },
          { key: 'assignee_name', label: 'Assignee' },
          { key: 'assignee_role', label: 'Role' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'points_value', label: 'Points', kind: 'number' },
          { key: 'due_date', label: 'Due' },
          { key: 'file_links', label: 'Files', kind: 'links' },
        ]}
        fields={taskFields}
        fixedValues={{ project_id: project.id, position: tasks.length }}
        canWrite={isAdmin}
        addLabel="Add deliverable"
        emptyText="No deliverables yet."
      />
    </>
  );
}

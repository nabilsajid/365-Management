import { ResourceManager } from '@/components/resource-manager';
import { asRows, getPageContext, rowsOf } from '@/lib/page';
import type { Project, Task } from '@/types/database';

export default async function MyTasksPage() {
  const { supabase, orgId, userId } = await getPageContext();

  const [tasksResult, projectsResult] = await Promise.all([
    supabase.from('tasks').select('*').eq('org_id', orgId).eq('assignee_id', userId).order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('projects').select('id, name').eq('org_id', orgId),
  ]);
  const tasks = rowsOf<Task>(tasksResult.data);
  const projectName = new Map(rowsOf<Pick<Project, 'id' | 'name'>>(projectsResult.data).map((project) => [project.id, project.name]));

  const rows = tasks.map((task) => ({
    ...task,
    project_name: projectName.get(task.project_id) ?? '—',
    href: `/tasks/${task.id}`,
  }));
  const open = rows.filter((task) => task.status !== 'approved');
  const done = rows.filter((task) => task.status === 'approved');

  const columns = [
    { key: 'title', label: 'Task', kind: 'nav' as const, hrefKey: 'href' },
    { key: 'project_name', label: 'Project' },
    { key: 'status', label: 'Status', kind: 'label' as const },
    { key: 'due_date', label: 'Due' },
    { key: 'file_links', label: 'Files', kind: 'links' as const },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Tasks</h1>
          <p className="muted">Deliverables assigned to you. Open a task to submit your work.</p>
        </div>
      </div>

      <ResourceManager
        title="To do"
        endpoint="/api/tasks"
        rows={asRows(open)}
        columns={columns}
        emptyText="Nothing is assigned to you right now."
      />
      <ResourceManager title="Approved" endpoint="/api/tasks" rows={asRows(done)} columns={columns} emptyText="No approved tasks yet." />
    </>
  );
}

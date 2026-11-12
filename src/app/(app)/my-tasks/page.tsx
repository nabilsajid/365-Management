import { ResourceManager } from '@/components/resource-manager';
import { asRows, getPageContext, rowsOf } from '@/lib/page';
import type { Profile, Project, ProjectMember, Task } from '@/types/database';

// Everything a person is involved in: tasks assigned to them, the projects they
// are on, and every task in those projects, so the whole team sees the work.
export default async function MyTasksPage() {
  const { supabase, orgId, userId } = await getPageContext();

  const membershipsR = await supabase.from('project_members').select('*').eq('org_id', orgId).eq('profile_id', userId);
  const memberProjectIds = rowsOf<ProjectMember>(membershipsR.data).map((row) => row.project_id);

  const [mineR, teamR, projectsR, peopleR] = await Promise.all([
    supabase.from('tasks').select('*').eq('org_id', orgId).eq('assignee_id', userId).order('due_date', { ascending: true, nullsFirst: false }),
    memberProjectIds.length > 0
      ? supabase.from('tasks').select('*').eq('org_id', orgId).in('project_id', memberProjectIds).order('position')
      : Promise.resolve({ data: [] }),
    supabase.from('projects').select('id, name, status, due_date').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name, job_title').eq('org_id', orgId),
  ]);
  const mine = rowsOf<Task>(mineR.data);
  const teamTasks = rowsOf<Task>(teamR.data).filter((task) => task.assignee_id !== userId);
  const projects = rowsOf<Pick<Project, 'id' | 'name' | 'status' | 'due_date'>>(projectsR.data);
  const person = new Map(rowsOf<Pick<Profile, 'id' | 'full_name' | 'job_title'>>(peopleR.data).map((profile) => [profile.id, profile]));
  const projectName = new Map(projects.map((project) => [project.id, project.name]));

  const involved = new Set([...memberProjectIds, ...mine.map((task) => task.project_id)]);
  const myProjects = projects
    .filter((project) => involved.has(project.id))
    .map((project) => ({ ...project, href: `/projects/${project.id}` }));

  const toRow = (task: Task) => ({
    ...task,
    project_name: projectName.get(task.project_id) ?? '—',
    assignee_name: task.assignee_id ? (person.get(task.assignee_id)?.full_name ?? '—') : 'Unassigned',
    href: `/tasks/${task.id}`,
  });
  const open = mine.filter((task) => task.status !== 'approved').map(toRow);
  const done = mine.filter((task) => task.status === 'approved').map(toRow);
  const team = teamTasks.map(toRow);

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
          <p className="muted">Your tasks, the projects you are on, and what the rest of each team is working on.</p>
        </div>
      </div>

      <ResourceManager
        title="Assigned to me"
        description="Open a task to submit your work."
        endpoint="/api/tasks"
        rows={asRows(open)}
        columns={columns}
        emptyText="Nothing is assigned to you right now."
      />

      <ResourceManager
        title="My projects"
        description="Projects you are assigned to. Open one to see its brief, links and team."
        endpoint="/api/projects"
        rows={asRows(myProjects)}
        columns={[
          { key: 'name', label: 'Project', kind: 'nav', hrefKey: 'href' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'due_date', label: 'Due' },
        ]}
        emptyText="You are not assigned to any project yet."
      />

      <ResourceManager
        title="Other tasks in my projects"
        description="Tasks your teammates hold in the projects you are on."
        endpoint="/api/tasks"
        rows={asRows(team)}
        columns={[
          { key: 'title', label: 'Task', kind: 'nav', hrefKey: 'href' },
          { key: 'project_name', label: 'Project' },
          { key: 'assignee_name', label: 'Assigned to' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'due_date', label: 'Due' },
        ]}
        emptyText="No other tasks in your projects."
      />

      {done.length > 0 ? (
        <ResourceManager title="My approved tasks" endpoint="/api/tasks" rows={asRows(done)} columns={columns} />
      ) : null}
    </>
  );
}

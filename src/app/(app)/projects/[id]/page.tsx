import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton, ApiForm, ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { label } from '@/lib/format';
import { asRows, enumOptions, getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import { titleTags } from '@/lib/domain/roles';
import type { Client, Profile, Project, ProjectComment, ProjectMember, Role, Task } from '@/types/database';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, userId, isAdmin, can, canEdit, localDateTime } = await getPageContext();

  const projectResult = await supabase.from('projects').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  const project = projectResult.data as Project | null;
  if (!project) notFound();

  const [clientResult, tasksResult, peopleResult, membersResult, rolesResult, commentsResult] = await Promise.all([
    project.client_id
      ? supabase.from('clients').select('*').eq('id', project.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('tasks').select('*').eq('project_id', id).eq('org_id', orgId).order('position'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('project_members').select('*').eq('project_id', id),
    supabase.from('roles').select('name, color').eq('org_id', orgId),
    supabase.from('project_comments').select('*').eq('project_id', id).eq('org_id', orgId).order('created_at'),
  ]);
  // Comments arrive with a database update; until then the section is left out.
  const commentsReady = !commentsResult.error;
  const comments = rowsOf<ProjectComment>(commentsResult.data);
  const client = clientResult.data as Client | null;
  const tasks = rowsOf<Task>(tasksResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const person = new Map(people.map((profile) => [profile.id, profile]));
  const team = rowsOf<ProjectMember>(membersResult.data)
    .map((row) => person.get(row.profile_id))
    .filter((profile): profile is Profile => Boolean(profile));
  const links = project.file_links ?? [];
  const roleColor = new Map(rowsOf<Pick<Role, 'name' | 'color'>>(rolesResult.data).map((role) => [role.name, role.color]));

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
            <Link href="/projects">Projects</Link>
            {client ? ` / ${client.name}` : ''}
          </p>
          <h1>{project.name}</h1>
        </div>
      </div>

      <section className="panel">
        <dl className="detail">
          <dt>Client</dt>
          <dd>{client?.name ?? 'No client (internal project)'}</dd>
          <dt>Team</dt>
          <dd>
            {team.length === 0 ? (
              'Nobody assigned yet.'
            ) : (
              <span className="grid gap-1.5">
                {team.map((profile) => (
                  <span key={profile.id} className="tags">
                    <strong>{profile.full_name}</strong>
                    {titleTags(profile.job_title, roleColor).map((tag) => (
                      <span key={tag.label} className={tag.color ? `badge tag-${tag.color}` : 'badge'}>
                        {tag.label}
                      </span>
                    ))}
                  </span>
                ))}
              </span>
            )}
          </dd>
          <dt>Links</dt>
          <dd>
            {links.length === 0
              ? 'No links attached.'
              : links.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="chip">
                    {link.label}
                  </a>
                ))}
          </dd>
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
        description={can('projects') ? 'One task per deliverable, each with its own description, file links and assignee.' : 'The deliverables in this project.'}
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
        canWrite={canEdit('projects')}
        needsApproval={!isAdmin}
        addLabel="Add deliverable"
        emptyText="No deliverables yet."
      />

      {commentsReady ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>
                Comments
                {comments.length > 0 ? <span className="count">{comments.length}</span> : null}
              </h2>
              <p className="muted">Anyone on the team can comment on this project.</p>
            </div>
          </header>
          {comments.length > 0 ? (
            <ul className="comments">
              {comments.map((comment) => {
                const author = comment.author_id ? person.get(comment.author_id) : undefined;
                return (
                  <li key={comment.id} className="comment">
                    <span className="avatar" aria-hidden>
                      {(author?.full_name ?? '?').charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="comment-meta">
                        <strong>{author?.full_name ?? 'Former employee'}</strong>
                        {author?.job_title ? <span> · {author.job_title}</span> : null}
                        <span> · {localDateTime(comment.created_at)}</span>
                      </p>
                      <p className="comment-body">{comment.body}</p>
                    </div>
                    {isAdmin || comment.author_id === userId ? (
                      <ActionButton endpoint={`/api/project-comments/${comment.id}`} method="DELETE">
                        Delete
                      </ActionButton>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="muted">No comments yet.</p>
          )}
          <ApiForm
            endpoint={`/api/projects/${project.id}/comments`}
            submitLabel="Add comment"
            fields={[{ name: 'body', label: 'Your comment', type: 'textarea', required: true, placeholder: 'Write an update, a question or feedback…' }]}
          />
        </section>
      ) : null}
    </>
  );
}

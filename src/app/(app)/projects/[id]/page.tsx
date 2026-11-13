import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyProject } from '@/components/copy-project';
import { DeleteProject } from '@/components/delete-project';
import { ActionButton, ApiForm, ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { label } from '@/lib/format';
import { asRows, enumOptions, getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import { TASK_KINDS, TASK_KIND_LABEL, TASK_KIND_SINGLE, thumbnailState, type TaskKind } from '@/lib/domain/deliverables';
import { titleTags } from '@/lib/domain/roles';
import type { Client, Profile, Project, ProjectComment, ProjectMember, Role, Task } from '@/types/database';

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, userId, isAdmin, canEdit, localDateTime } = await getPageContext();

  const projectResult = await supabase.from('projects').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  const project = projectResult.data as Project | null;
  if (!project) notFound();

  const [clientResult, tasksResult, peopleResult, membersResult, rolesResult, commentsResult, directProbe] = await Promise.all([
    project.client_id
      ? supabase.from('clients').select('*').eq('id', project.client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('tasks').select('*').eq('project_id', id).eq('org_id', orgId).order('position'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('project_members').select('*').eq('project_id', id),
    supabase.from('roles').select('name, color').eq('org_id', orgId),
    supabase.from('project_comments').select('*').eq('project_id', id).eq('org_id', orgId).order('created_at'),
    // After the project rules database update, project roles change things without admin approval.
    supabase.from('notifications').select('id').limit(1),
  ]);
  const needsApproval = !isAdmin && Boolean(directProbe.error);
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

  // Deliverable types, thumbnail pairing and the shoot status arrive with a database update.
  const typesReady = 'shoot_status' in project;
  const mayEdit = canEdit('projects');
  const titleOf = new Map(tasks.map((task) => [task.id, task.title]));
  const videos = tasks.filter((task) => task.kind === 'video');

  const taskRows = tasks.map((task) => {
    const assignee = task.assignee_id ? person.get(task.assignee_id) : undefined;
    return {
      ...task,
      kind: (task.kind ?? 'other') as TaskKind,
      assignee_name: assignee?.full_name ?? 'Unassigned',
      assignee_role: assignee?.job_title ?? null,
      href: `/tasks/${task.id}`,
      // On a video: where its thumbnail stands. On a thumbnail: which video it is for.
      thumbnail: task.kind === 'video' ? thumbnailState(task.id, tasks) : null,
      for_video: task.for_task_id ? (titleOf.get(task.for_task_id) ?? '—') : null,
    };
  });

  const kindField: Field = {
    name: 'kind',
    label: 'Type',
    type: 'select',
    required: true,
    options: TASK_KINDS.map((kind) => ({ value: kind, label: TASK_KIND_SINGLE[kind] })),
  };
  const forVideoField: Field = {
    name: 'for_task_id',
    label: 'Thumbnail for',
    type: 'select',
    options: videos.map((video) => ({ value: video.id, label: video.title })),
    hint: 'The video this thumbnail belongs to.',
  };
  const baseFields: Field[] = [
    { name: 'title', label: 'Title', required: true, placeholder: 'Video 1' },
    { name: 'assignee_id', label: 'Assignee', type: 'select', options: peopleOptions(people), hint: 'Anyone on the team, including people not assigned to this project. They are notified.' },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'todo', options: enumOptions(isAdmin ? ['todo', 'in_progress', 'submitted', 'changes_requested', 'approved'] : ['todo', 'in_progress', 'submitted', 'changes_requested']) },
    // Points are an admin's decision.
    ...(isAdmin ? [{ name: 'points_value', label: 'Points on approval', type: 'number' as const, hint: 'Leave empty to use the organization default.' }] : []),
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'description', label: 'Quick notes', type: 'textarea', placeholder: 'Longer than the rest, about 10 minutes.' },
    { name: 'file_links', label: 'File links', type: 'links' },
  ];
  /** The form for one type of deliverable; thumbnails also choose their video. */
  const fieldsFor = (kind: TaskKind | null, editing: boolean): Field[] => {
    if (!typesReady) return baseFields;
    const [title, ...rest] = baseFields;
    return [
      title,
      ...(editing || kind === null ? [kindField] : []),
      ...(kind === 'thumbnail' || kind === null ? [forVideoField] : []),
      ...rest,
    ];
  };
  const columnsFor = (kind: TaskKind | null) => [
    { key: 'title', label: 'Task', kind: 'nav' as const, hrefKey: 'href' },
    ...(kind === 'video' ? [{ key: 'thumbnail', label: 'Thumbnail', kind: 'label' as const }] : []),
    ...(kind === 'thumbnail' ? [{ key: 'for_video', label: 'For video' }] : []),
    { key: 'description', label: 'Notes' },
    { key: 'assignee_name', label: 'Assignee' },
    { key: 'status', label: 'Status', kind: 'label' as const },
    { key: 'points_value', label: 'Points', kind: 'number' as const },
    { key: 'due_date', label: 'Due' },
    { key: 'file_links', label: 'Files', kind: 'links' as const },
  ];
  const groups = typesReady ? TASK_KINDS.filter((kind) => taskRows.some((task) => task.kind === kind)) : [];
  const missingThumbnails = taskRows.filter((task) => task.thumbnail === 'missing').length;

  const shootText =
    project.shoot_status === 'waiting'
      ? 'Waiting for the client to confirm'
      : project.shoot_status === 'confirmed'
        ? `Confirmed${project.shoot_date ? ` for ${project.shoot_date}` : ''}`
        : 'No shoot planned';

  // The next batch for the same client: same scope, no dates, links or progress.
  const copyPayload = {
    name: `${project.name} (copy)`,
    client_name: client?.name ?? null,
    brief: project.brief,
    member_ids: team.map((profile) => profile.id),
    deliverables: tasks.map((task) => ({
      title: task.title,
      description: task.description,
      assignee_id: task.assignee_id,
      ...(isAdmin ? { points_value: task.points_value } : {}),
      ...(typesReady ? { kind: task.kind ?? 'other' } : {}),
      ...(task.for_task_id && tasks.some((other) => other.id === task.for_task_id)
        ? { for_index: tasks.findIndex((other) => other.id === task.for_task_id) }
        : {}),
    })),
  };

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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mayEdit ? <CopyProject payload={copyPayload} /> : null}
          {isAdmin ? <DeleteProject id={project.id} name={project.name} /> : null}
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
          {typesReady ? (
            <>
              <dt>Shoot</dt>
              <dd>
                <span className={project.shoot_status === 'waiting' ? 'badge badge-pending' : project.shoot_status === 'confirmed' ? 'badge badge-approved' : 'badge'}>
                  {shootText}
                </span>
              </dd>
            </>
          ) : null}
          <dt>Dates</dt>
          <dd>
            {project.start_date ?? '—'} to {project.due_date ?? '—'}
          </dd>
          <dt>Brief</dt>
          <dd>{project.brief ?? 'No brief written yet.'}</dd>
        </dl>
      </section>

      {typesReady && mayEdit ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Shoot</h2>
              <p className="muted">
                No fixed date yet? Mark it as waiting, then set the date once the client confirms.
                {needsApproval ? ' Your change goes to an admin for approval.' : ''}
              </p>
            </div>
          </header>
          <ApiForm
            endpoint={`/api/projects/${project.id}`}
            method="PATCH"
            submitLabel="Save shoot"
            resetOnSuccess={false}
            initial={{ shoot_status: project.shoot_status ?? 'none', shoot_date: project.shoot_date ?? null }}
            fields={[
              {
                name: 'shoot_status',
                label: 'Shoot',
                type: 'select',
                required: true,
                options: [
                  { value: 'none', label: 'No shoot planned' },
                  { value: 'waiting', label: 'Waiting for client confirmation' },
                  { value: 'confirmed', label: 'Confirmed' },
                ],
              },
              { name: 'shoot_date', label: 'Shoot date', type: 'date', hint: 'Fill in once confirmed.' },
            ]}
          />
        </section>
      ) : null}

      {typesReady && missingThumbnails > 0 ? (
        <p role="status" className="mb-5 rounded-card border border-warning bg-warning-soft px-4 py-3 text-[13px] text-warning-strong">
          {missingThumbnails} {missingThumbnails === 1 ? 'video has' : 'videos have'} no thumbnail yet. Add a thumbnail and choose the video it is for.
        </p>
      ) : null}

      {groups.map((kind) => (
        <ResourceManager
          key={kind}
          title={TASK_KIND_LABEL[kind]}
          endpoint="/api/tasks"
          rows={asRows(taskRows.filter((task) => task.kind === kind))}
          columns={columnsFor(kind)}
          fields={fieldsFor(kind, false)}
          editFields={fieldsFor(kind, true)}
          fixedValues={{ project_id: project.id, position: tasks.length, kind }}
          canWrite={mayEdit}
          needsApproval={needsApproval}
          addLabel={`Add ${TASK_KIND_SINGLE[kind].toLowerCase()}`}
          pageSize={25}
        />
      ))}

      {typesReady ? (
        mayEdit || groups.length === 0 ? (
          <ResourceManager
            title={groups.length === 0 ? 'Deliverables' : 'Add another type'}
            description={
              groups.length === 0
                ? 'Everything this client gets, one line each: a shoot, videos, thumbnails, graphics. They are grouped by type.'
                : 'A shoot, a video, a thumbnail, a graphic or anything else. It joins its own group above.'
            }
            endpoint="/api/tasks"
            rows={[]}
            columns={columnsFor(null)}
            fields={fieldsFor(null, false)}
            fixedValues={{ project_id: project.id, position: tasks.length }}
            canWrite={mayEdit}
            needsApproval={needsApproval}
            addLabel="Add deliverable"
            emptyText={groups.length === 0 ? 'No deliverables yet.' : 'Choose a type when adding.'}
          />
        ) : null
      ) : (
        <ResourceManager
          title="Deliverables"
          description="One task per deliverable, each with its own notes, file links and assignee."
          endpoint="/api/tasks"
          rows={asRows(taskRows)}
          columns={columnsFor(null)}
          fields={baseFields}
          fixedValues={{ project_id: project.id, position: tasks.length }}
          canWrite={mayEdit}
          needsApproval={needsApproval}
          addLabel="Add deliverable"
          emptyText="No deliverables yet."
        />
      )}

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

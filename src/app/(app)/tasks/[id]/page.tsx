import { Check } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionButton, ApiForm, ResourceManager } from '@/components/resource-manager';
import { TaskFiles } from '@/components/task-files';
import { label } from '@/lib/format';
import { asRows, enumOptions, getPageContext, rowsOf } from '@/lib/page';
import type { Profile, Project, Task, TaskSubmission } from '@/types/database';

const KIND_LABEL: Record<string, string> = { drive: 'Google Drive', dropbox: 'Dropbox', text: 'Text note' };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, isAdmin, userId, can, localDate, localDateTime } = await getPageContext();

  const taskResult = await supabase.from('tasks').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  const task = taskResult.data as Task | null;
  if (!task) notFound();

  const [projectResult, submissionsResult, peopleResult, commentsResult, filesResult, feedbackResult] = await Promise.all([
    supabase.from('projects').select('*').eq('id', task.project_id).maybeSingle(),
    supabase.from('task_submissions').select('*').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('org_id', orgId),
    supabase.from('task_comments').select('*').eq('task_id', id).eq('org_id', orgId).order('created_at'),
    supabase.from('task_files').select('*').eq('task_id', id).eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('client_feedback').select('*').eq('task_id', id).eq('org_id', orgId).order('created_at', { ascending: false }),
  ]);
  // File uploads and client feedback arrive with a database update; until then they are left out.
  const filesReady = !filesResult.error;
  const feedback = rowsOf<{ id: string; name: string; decision: 'approved' | 'changes'; comment: string | null; created_at: string }>(feedbackResult.data);
  // Comments arrive with a database update; until then the section is left out.
  const commentsReady = !commentsResult.error;
  const comments = rowsOf<{ id: string; author_id: string | null; body: string; created_at: string }>(commentsResult.data);
  const mentionable = rowsOf<Profile>(peopleResult.data)
    .filter((profile) => profile.is_active)
    .map((profile) => (profile.nickname || profile.full_name.split(' ')[0]).replace(/\s+/g, ''));
  const project = projectResult.data as Project | null;
  const submissions = rowsOf<TaskSubmission>(submissionsResult.data);
  const person = new Map(rowsOf<Profile>(peopleResult.data).map((profile) => [profile.id, profile]));
  const assignee = task.assignee_id ? person.get(task.assignee_id) : undefined;
  const canSubmit = isAdmin || task.assignee_id === userId;
  const files = rowsOf<{ id: string; name: string; size: number; uploaded_by: string | null; created_at: string }>(filesResult.data).map((file) => ({
    id: file.id,
    name: file.name,
    size: Number(file.size),
    uploaded_by_name: file.uploaded_by ? (person.get(file.uploaded_by)?.full_name ?? '—') : '—',
    uploaded_on: localDate(file.created_at),
    can_remove: isAdmin || file.uploaded_by === userId,
  }));

  const submissionRows = submissions.map((submission) => ({
    ...submission,
    submitted_by_name: person.get(submission.submitted_by)?.full_name ?? '—',
    kind_label: KIND_LABEL[submission.kind] ?? submission.kind,
    link_text: submission.url ? 'Open link' : null,
    reviewer_name: submission.reviewed_by ? (person.get(submission.reviewed_by)?.full_name ?? '—') : null,
    submitted_on: localDate(submission.created_at),
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <p className="muted">
            {can('projects') ? <Link href="/projects">Projects</Link> : <Link href="/my-tasks">My Tasks</Link>} /{' '}
            <Link href={`/projects/${task.project_id}`}>{project?.name ?? 'Project'}</Link>
          </p>
          <h1>{task.title}</h1>
        </div>
      </div>

      {task.status === 'approved' ? (
        <div className="done-banner" role="status">
          <span className="check">
            <Check size={16} aria-hidden strokeWidth={3} />
          </span>
          <span>
            Task completed and approved
            {task.points_value ? ` · ${task.points_value} points awarded` : ''}
          </span>
        </div>
      ) : null}

      <section className="panel">
        <dl className="detail">
          <dt>Assignee</dt>
          <dd>{assignee ? `${assignee.full_name} · ${assignee.job_title ?? 'No job role set'}` : 'Unassigned'}</dd>
          <dt>Status</dt>
          <dd>{label(task.status)}</dd>
          <dt>Due</dt>
          <dd>{task.due_date ?? '—'}</dd>
          <dt>Description</dt>
          <dd>{task.description ?? 'No description.'}</dd>
          <dt>Files</dt>
          <dd>
            {task.file_links.length === 0
              ? 'No file links.'
              : task.file_links.map((link) => (
                  <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="chip">
                    {link.label}
                  </a>
                ))}
          </dd>
        </dl>
      </section>

      {filesReady ? <TaskFiles orgId={orgId} taskId={task.id} files={files} canUpload={canSubmit || can('projects')} /> : null}

      {feedback.length > 0 ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Client feedback</h2>
              <p className="muted">What the client said through the project&apos;s review link.</p>
            </div>
          </header>
          <ul className="comments">
            {feedback.map((entry) => (
              <li key={entry.id} className="comment">
                <span className="avatar" aria-hidden>
                  {entry.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="comment-meta">
                    <strong>{entry.name}</strong>
                    <span> · {localDateTime(entry.created_at)} </span>
                    <span className={entry.decision === 'approved' ? 'badge badge-approved' : 'badge badge-pending'}>
                      {entry.decision === 'approved' ? 'Approved' : 'Asked for changes'}
                    </span>
                  </p>
                  {entry.comment ? <p className="comment-body">{entry.comment}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ResourceManager
        title="Submissions"
        description={isAdmin ? 'Edit a submission to approve it or request changes.' : undefined}
        endpoint="/api/submissions"
        rows={asRows(submissionRows)}
        columns={[
          { key: 'submitted_on', label: 'Submitted' },
          { key: 'submitted_by_name', label: 'By' },
          { key: 'kind_label', label: 'Type' },
          { key: 'link_text', label: 'Link', kind: 'link', hrefKey: 'url' },
          { key: 'note', label: 'Note' },
          { key: 'review_status', label: 'Review', kind: 'label' },
          { key: 'review_note', label: 'Review note' },
          { key: 'reviewer_name', label: 'Reviewed by' },
        ]}
        editFields={[
          { name: 'review_status', label: 'Review', type: 'select', required: true, options: enumOptions(['pending', 'approved', 'changes_requested']) },
          { name: 'review_note', label: 'Review note', type: 'textarea' },
        ]}
        canWrite={isAdmin}
        emptyText="Nothing submitted yet."
      />

      {canSubmit ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Submit work</h2>
              <p className="muted">Share a Google Drive or Dropbox link, or leave a text note.</p>
            </div>
          </header>
          <ApiForm
            endpoint={`/api/tasks/${task.id}/submissions`}
            submitLabel="Submit"
            fields={[
              {
                name: 'kind',
                label: 'Type',
                type: 'select',
                required: true,
                options: [
                  { value: 'drive', label: 'Google Drive link' },
                  { value: 'dropbox', label: 'Dropbox link' },
                  { value: 'text', label: 'Text note' },
                ],
              },
              { name: 'url', label: 'Link', placeholder: 'https://…' },
              { name: 'note', label: 'Note', type: 'textarea' },
            ]}
          />
        </section>
      ) : null}

      {commentsReady ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>
                Comments
                {comments.length > 0 ? <span className="count">{comments.length}</span> : null}
              </h2>
              <p className="muted">
                Write @ and a first name to tell someone, for example {mentionable.slice(0, 3).map((name) => `@${name}`).join(', ')}. The assignee is told about every comment.
              </p>
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
                        <span> · {localDateTime(comment.created_at)}</span>
                      </p>
                      <p className="comment-body">
                        {comment.body.split(/(@[\w.-]+)/g).map((part, index) =>
                          part.startsWith('@') ? (
                            <span key={index} className="mention">
                              {part}
                            </span>
                          ) : (
                            part
                          ),
                        )}
                      </p>
                    </div>
                    {isAdmin || comment.author_id === userId ? (
                      <ActionButton endpoint={`/api/task-comments/${comment.id}`} method="DELETE">
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
            endpoint={`/api/tasks/${task.id}/comments`}
            submitLabel="Add comment"
            fields={[{ name: 'body', label: 'Your comment', type: 'textarea', required: true, placeholder: 'A question, an update, or feedback. Use @Name to tell someone.' }]}
          />
        </section>
      ) : null}
    </>
  );
}

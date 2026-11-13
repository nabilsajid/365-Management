import { Check } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiForm, ResourceManager } from '@/components/resource-manager';
import { label } from '@/lib/format';
import { asRows, enumOptions, getPageContext, rowsOf } from '@/lib/page';
import type { Profile, Project, Task, TaskSubmission } from '@/types/database';

const KIND_LABEL: Record<string, string> = { drive: 'Google Drive', dropbox: 'Dropbox', text: 'Text note' };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, isAdmin, userId, can, localDate } = await getPageContext();

  const taskResult = await supabase.from('tasks').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  const task = taskResult.data as Task | null;
  if (!task) notFound();

  const [projectResult, submissionsResult, peopleResult] = await Promise.all([
    supabase.from('projects').select('*').eq('id', task.project_id).maybeSingle(),
    supabase.from('task_submissions').select('*').eq('task_id', id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('org_id', orgId),
  ]);
  const project = projectResult.data as Project | null;
  const submissions = rowsOf<TaskSubmission>(submissionsResult.data);
  const person = new Map(rowsOf<Profile>(peopleResult.data).map((profile) => [profile.id, profile]));
  const assignee = task.assignee_id ? person.get(task.assignee_id) : undefined;
  const canSubmit = isAdmin || task.assignee_id === userId;

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
    </>
  );
}

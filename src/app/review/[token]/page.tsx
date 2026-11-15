import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ReviewForm } from '@/components/review-form';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Review', robots: { index: false, follow: false } };

const KIND: Record<string, string> = { video: 'Video', thumbnail: 'Thumbnail', photo: 'Photo', post: 'Social media post', graphic: 'Graphic', shoot: 'Shoot', other: 'Deliverable' };
const STATUS: Record<string, string> = {
  todo: 'Not started',
  in_progress: 'In progress',
  submitted: 'Ready for review',
  changes_requested: 'Being revised',
  approved: 'Done',
};

type TaskRow = { id: string; title: string; kind: string | null; status: string; due_date: string | null };

// What a client sees through a project's review link: no account, no other
// project, nothing about money or the team. Work is shared as Drive or Dropbox links.
export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();

  const link = await admin.from('review_links').select('id, org_id, project_id').eq('token', token).eq('is_active', true).maybeSingle();
  if (!link.data) notFound();
  const { org_id: orgId, project_id: projectId } = link.data as { org_id: string; project_id: string };

  const [orgR, projectR, tasksR] = await Promise.all([
    admin.from('organizations').select('name').eq('id', orgId).maybeSingle(),
    admin.from('projects').select('*').eq('id', projectId).maybeSingle(),
    admin.from('tasks').select('*').eq('project_id', projectId).order('position'),
  ]);
  const project = projectR.data as { name: string; brief: string | null; due_date: string | null; kind?: string } | null;
  if (!project) notFound();
  // A monthly client sees the latest month only.
  let tasks = (tasksR.data ?? []) as (TaskRow & { month_id?: string | null })[];
  let monthLabel: string | null = null;
  if (project.kind === 'monthly') {
    const latest = await admin.from('project_months').select('id, month').eq('project_id', projectId).order('month', { ascending: false }).limit(1).maybeSingle();
    const month = latest.data as { id: string; month: string } | null;
    if (month) {
      tasks = tasks.filter((task) => task.month_id === month.id);
      monthLabel = new Date(`${month.month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    }
  }
  const ids = tasks.map((task) => task.id);

  const [submissionsR, feedbackR] = ids.length
    ? await Promise.all([
        admin.from('task_submissions').select('task_id, kind, url, note, created_at').in('task_id', ids).order('created_at', { ascending: false }),
        admin.from('client_feedback').select('task_id, decision, created_at').eq('link_id', link.data.id).order('created_at', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  const submissions = (submissionsR.data ?? []) as { task_id: string; kind: string; url: string | null; note: string | null }[];
  const lastAnswer = new Map<string, string>();
  for (const row of (feedbackR.data ?? []) as { task_id: string; decision: string }[]) if (!lastAnswer.has(row.task_id)) lastAnswer.set(row.task_id, row.decision);

  return (
    <main className="public-page">
      <p className="brand-line">{(orgR.data as { name: string } | null)?.name ?? '365 Frames'} · Client review</p>
      <div>
        <h1 style={{ fontSize: '1.6rem', margin: 0 }}>{project.name}</h1>
        {monthLabel ? <p className="muted">{monthLabel}</p> : project.due_date ? <p className="muted">Due {project.due_date}</p> : null}
      </div>
      {project.brief ? (
        <section className="panel">
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{project.brief}</p>
        </section>
      ) : null}
      {tasks.length === 0 ? <section className="panel muted">Nothing to review yet.</section> : null}
      {tasks.map((task) => {
        const shared = submissions.filter((row) => row.task_id === task.id && row.url).slice(0, 3);
        const notes = submissions.filter((row) => row.task_id === task.id && !row.url && row.note).slice(0, 1);
        const answer = lastAnswer.get(task.id);
        return (
          <section key={task.id} className="panel review-item">
            <div className="tags">
              <strong style={{ fontSize: '1rem' }}>{task.title}</strong>
              <span className="badge">{KIND[task.kind ?? 'other'] ?? 'Deliverable'}</span>
              <span className={task.status === 'approved' ? 'badge badge-approved' : 'badge badge-pending'}>{STATUS[task.status] ?? task.status}</span>
              {answer ? <span className="badge">{answer === 'approved' ? 'You approved this' : 'You asked for changes'}</span> : null}
            </div>
            {shared.length ? (
              <div className="tags">
                {shared.map((row) => (
                  <a key={row.url!} className="chip" href={row.url!} target="_blank" rel="noreferrer">
                    {row.kind === 'dropbox' ? 'Dropbox link' : 'Drive link'}
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted" style={{ margin: 0 }}>No work shared yet.</p>
            )}
            {notes.map((row, index) => (
              <p key={index} className="muted" style={{ margin: 0 }}>{row.note}</p>
            ))}
            <ReviewForm token={token} taskId={task.id} />
          </section>
        );
      })}
    </main>
  );
}

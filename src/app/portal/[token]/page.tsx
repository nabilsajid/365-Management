import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isFirstCompany } from '@/components/invoice-sheet';
import { ReviewForm } from '@/components/review-form';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Client portal', robots: { index: false, follow: false } };

const KIND: Record<string, string> = { video: 'Video', thumbnail: 'Thumbnail', photo: 'Photo', post: 'Social media post', graphic: 'Graphic', shoot: 'Shoot', other: 'Deliverable' };
const STATUS: Record<string, string> = { todo: 'Not started', in_progress: 'In progress', submitted: 'Ready for your review', changes_requested: 'Being revised', approved: 'Done' };

type Project = { id: string; name: string; status: string; kind?: string | null; due_date: string | null; brief: string | null };
type Task = { id: string; project_id: string; title: string; kind: string | null; status: string; due_date: string | null; month_id?: string | null };

const money = (value: number, currency: string) => `${currency === 'BDT' ? '৳' : `${currency} `}${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

// A client's own page, through the private link the company shared: their
// projects and progress, work waiting for their approval, and their invoices.
// Nothing about other clients, the team's money or points.
export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();
  const portal = await admin.from('client_portals').select('*').eq('token', token).eq('is_active', true).maybeSingle();
  if (!portal.data) notFound();
  const { org_id: orgId, client_id: clientId, show_invoices: showInvoices, show_drafts: showDrafts } = portal.data as {
    org_id: string;
    client_id: string;
    show_invoices?: boolean;
    show_drafts?: boolean;
  };

  const [orgR, logoR, clientR, projectsR, invoicesR] = await Promise.all([
    admin.from('organizations').select('name, currency').eq('id', orgId).maybeSingle(),
    admin.from('org_logos').select('data').eq('org_id', orgId).maybeSingle(),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    admin.from('projects').select('id, name, status, kind, due_date, brief').eq('client_id', clientId).neq('status', 'archived').order('created_at', { ascending: false }),
    // Invoices only once the company turns them on, and drafts only when that is on too.
    showInvoices
      ? (showDrafts
          ? admin.from('invoices').select('id, invoice_number, issue_date, due_date, amount, status').eq('client_id', clientId).neq('status', 'void')
          : admin.from('invoices').select('id, invoice_number, issue_date, due_date, amount, status').eq('client_id', clientId).not('status', 'in', '(draft,void)')
        ).order('issue_date', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const org = orgR.data as { name: string; currency: string } | null;
  const currency = org?.currency ?? 'BDT';
  const projects = (projectsR.data ?? []) as Project[];
  const ids = projects.map((project) => project.id);

  // Monthly clients: only the latest month's work.
  const [tasksR, monthsR] = ids.length
    ? await Promise.all([
        admin.from('tasks').select('id, project_id, title, kind, status, due_date, month_id').in('project_id', ids).order('position'),
        admin.from('project_months').select('id, project_id, month').in('project_id', ids).order('month', { ascending: false }),
      ])
    : [{ data: [] }, { data: [] }];
  const latestMonth = new Map<string, { id: string; month: string }>();
  for (const row of (monthsR.data ?? []) as { id: string; project_id: string; month: string }[]) if (!latestMonth.has(row.project_id)) latestMonth.set(row.project_id, row);
  const tasks = ((tasksR.data ?? []) as Task[]).filter((task) => {
    const project = projects.find((item) => item.id === task.project_id);
    return project?.kind !== 'monthly' || task.month_id === latestMonth.get(task.project_id)?.id;
  });
  const taskIds = tasks.map((task) => task.id);

  const [submissionsR, feedbackR, balancesR] = await Promise.all([
    taskIds.length ? admin.from('task_submissions').select('task_id, kind, url, note, created_at').in('task_id', taskIds).order('created_at', { ascending: false }) : { data: [] },
    taskIds.length ? admin.from('client_feedback').select('task_id, decision, created_at').in('task_id', taskIds).order('created_at', { ascending: false }) : { data: [] },
    admin.from('invoice_balances').select('invoice_id, paid, outstanding').in('invoice_id', ((invoicesR.data ?? []) as { id: string }[]).map((row) => row.id)),
  ]);
  const submissions = (submissionsR.data ?? []) as { task_id: string; kind: string; url: string | null; note: string | null }[];
  const answered = new Map<string, string>();
  for (const row of (feedbackR.data ?? []) as { task_id: string; decision: string }[]) if (!answered.has(row.task_id)) answered.set(row.task_id, row.decision);
  const balance = new Map(((balancesR.data ?? []) as { invoice_id: string; paid: number; outstanding: number }[]).map((row) => [row.invoice_id, row]));
  const invoices = (invoicesR.data ?? []) as { id: string; invoice_number: string; issue_date: string; due_date: string | null; amount: number; status: string }[];
  const waiting = tasks.filter((task) => task.status === 'submitted' && !answered.has(task.id));
  // The company's logo; 365 Frames (the first company) falls back to its built-in white logo.
  const logo = (logoR.data as { data?: string } | null)?.data ?? ((await isFirstCompany(admin, orgId)) ? '/logo.png' : null);

  return (
    <main className="public-page portal">
      <header className="portal-head">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logo ? <img src={logo} alt={org?.name ?? ''} className="portal-logo" /> : <p className="brand-line">{org?.name}</p>}
        <div>
          <h1 style={{ fontSize: '1.6rem', margin: 0 }}>{(clientR.data as { name: string } | null)?.name}</h1>
          <p className="muted" style={{ margin: 0 }}>Your projects with {org?.name}</p>
        </div>
      </header>

      {waiting.length > 0 ? (
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Waiting for your review ({waiting.length})</h2>
          <p className="muted">Open the link, then approve it or tell the team what to change.</p>
        </section>
      ) : null}

      {projects.length === 0 ? <section className="panel muted">No projects yet.</section> : null}
      {projects.map((project) => {
        const own = tasks.filter((task) => task.project_id === project.id);
        const done = own.filter((task) => task.status === 'approved').length;
        const percent = own.length ? Math.round((done / own.length) * 100) : 0;
        const month = latestMonth.get(project.id);
        return (
          <section key={project.id} className="panel">
            <div className="tags" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ margin: 0 }}>{project.name}</h2>
              <span className={project.status === 'completed' ? 'badge badge-approved' : 'badge'}>
                {project.status === 'completed' ? 'Completed' : project.status === 'onboarding' ? 'Getting started' : 'In progress'}
              </span>
            </div>
            <p className="muted" style={{ margin: '0.25rem 0 0.5rem' }}>
              {project.kind === 'monthly' && month
                ? new Date(`${month.month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
                : project.due_date
                  ? `Due ${project.due_date}`
                  : null}
              {own.length ? ` · ${done} of ${own.length} done` : ''}
            </p>
            {own.length ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-success" style={{ width: `${percent}%` }} />
              </div>
            ) : null}
            <ul className="portal-tasks">
              {own.map((task) => {
                const links = submissions.filter((row) => row.task_id === task.id && row.url).slice(0, 2);
                const answer = answered.get(task.id);
                return (
                  <li key={task.id}>
                    <div className="tags">
                      <strong>{task.title}</strong>
                      <span className="badge">{KIND[task.kind ?? 'other'] ?? 'Deliverable'}</span>
                      <span className={task.status === 'approved' ? 'badge badge-approved' : task.status === 'submitted' ? 'badge badge-pending' : 'badge'}>
                        {STATUS[task.status] ?? task.status}
                      </span>
                      {answer ? <span className="badge">{answer === 'approved' ? 'You approved this' : 'You asked for changes'}</span> : null}
                      {links.map((row) => (
                        <a key={row.url!} className="chip" href={row.url!} target="_blank" rel="noreferrer">
                          {row.kind === 'dropbox' ? 'Dropbox link' : 'Drive link'}
                        </a>
                      ))}
                    </div>
                    {task.status === 'submitted' ? <ReviewForm token={token} taskId={task.id} endpoint={`/api/portal/${token}`} /> : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {showInvoices ? (
      <section className="panel">
        <h2 style={{ marginTop: 0 }}>Invoices</h2>
        {invoices.length === 0 ? (
          <p className="muted">No invoices yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Due</th>
                  <th className="num">Amount</th>
                  <th className="num">Still to pay</th>
                  <th aria-label="Download" />
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => {
                  const left = Number(balance.get(invoice.id)?.outstanding ?? invoice.amount);
                  return (
                    <tr key={invoice.id}>
                      <td>
                        {invoice.invoice_number} {invoice.status === 'draft' ? <span className="badge">Draft</span> : null}
                      </td>
                      <td>{invoice.issue_date}</td>
                      <td>{invoice.due_date ?? '—'}</td>
                      <td className="num">{money(invoice.amount, currency)}</td>
                      <td className="num">{left > 0 ? money(left, currency) : <span className="badge badge-approved">Paid</span>}</td>
                      <td>
                        <Link href={`/portal/${token}/invoice/${invoice.id}`}>View / download</Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      ) : null}
    </main>
  );
}

import { redirect } from 'next/navigation';
import { EmailApproval } from '@/components/email-approval';
import { getPageContext, rowsOf } from '@/lib/page';

const KIND: Record<string, string> = { alert: 'Alert', salary: 'Salary / payment', other: 'Email' };
const STATUS: Record<string, string> = { sent: 'Sent', rejected: 'Not sent', failed: 'Failed', pending: 'Waiting' };

type Email = {
  id: string;
  to_email: string;
  kind: string;
  subject: string;
  body: string;
  status: string;
  error: string | null;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
};

// Every email waits here until it is approved: admins, and people whose role
// allows approving emails, read it, change it if needed, and send it or not.
export default async function EmailApprovalsPage() {
  const { supabase, orgId, isAdmin, can, localDateTime } = await getPageContext();
  if (!isAdmin && !can('emails')) redirect('/dashboard');
  const [waitingR, historyR, peopleR] = await Promise.all([
    supabase.from('email_outbox').select('*').eq('org_id', orgId).in('status', ['pending', 'failed']).order('created_at'),
    supabase.from('email_outbox').select('*').eq('org_id', orgId).in('status', ['sent', 'rejected']).order('decided_at', { ascending: false }).limit(40),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
  ]);
  if (waitingR.error) {
    return (
      <section className="panel">
        <p className="muted">Email approvals arrive with the next database update. Reload this page in a minute.</p>
      </section>
    );
  }
  const waiting = rowsOf<Email>(waitingR.data);
  const history = rowsOf<Email>(historyR.data);
  const name = new Map(rowsOf<{ id: string; full_name: string }>(peopleR.data).map((row) => [row.id, row.full_name]));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Email approvals</h1>
          <p className="muted">
            No email leaves without approval. Read each one, change the subject or message if needed, then send it or
            not. Alerts are prepared every morning; salary emails when a payslip is paid.
          </p>
        </div>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Waiting ({waiting.length})</h2>
          </div>
        </header>
        {waiting.length === 0 ? (
          <p className="muted empty">Nothing waiting. New emails appear here before they are sent.</p>
        ) : (
          <div className="email-list">
            {waiting.map((email) => (
              <EmailApproval
                key={email.id}
                id={email.id}
                to={email.to_email}
                kindLabel={KIND[email.kind] ?? 'Email'}
                subject={email.subject}
                body={email.body}
                failed={email.status === 'failed'}
                error={email.error}
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Recently decided</h2>
          </div>
        </header>
        {history.length === 0 ? (
          <p className="muted empty">Nothing yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>To</th>
                  <th>Type</th>
                  <th>Result</th>
                  <th>By</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {history.map((email) => (
                  <tr key={email.id}>
                    <td>{email.subject}</td>
                    <td>{email.to_email}</td>
                    <td>{KIND[email.kind] ?? 'Email'}</td>
                    <td>
                      <span className={email.status === 'sent' ? 'badge badge-approved' : 'badge'}>{STATUS[email.status] ?? email.status}</span>
                    </td>
                    <td>{email.decided_by ? (name.get(email.decided_by) ?? '—') : '—'}</td>
                    <td>{email.decided_at ? localDateTime(email.decided_at) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

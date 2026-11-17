import { ComposeEmail } from '@/components/compose-email';
import { EmailApproval } from '@/components/email-approval';
import { getPageContext, rowsOf } from '@/lib/page';

const KIND: Record<string, string> = { alert: 'Alert', salary: 'Salary / payment', other: 'Custom email' };
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

// Approvals → Emails: every email waits here until it is approved. Admins, and
// people whose role allows approving emails, read it, change it if needed, and send it or not.
export async function EmailSection() {
  const { supabase, orgId, localDateTime } = await getPageContext();
  const [waitingR, historyR, peopleR, clientsR] = await Promise.all([
    supabase.from('email_outbox').select('*').eq('org_id', orgId).in('status', ['pending', 'failed']).order('created_at'),
    supabase.from('email_outbox').select('*').eq('org_id', orgId).in('status', ['sent', 'rejected']).order('decided_at', { ascending: false }).limit(60),
    supabase.from('profiles').select('id, full_name, is_active').eq('org_id', orgId),
    supabase.from('clients').select('id, name, email').eq('org_id', orgId).order('name'),
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
      <p className="muted">
        No email leaves without approval. Read each one, change the subject or message if needed, then send it or not.
        Alerts are prepared every morning; salary emails when a payslip is paid. Write your own with New email.
      </p>

      <details className="panel fold">
        <summary>New email</summary>
        <p className="muted">Write your own email to people in the team, everyone, your clients, or any address. Send it now, or save it for another approver to check.</p>
        <ComposeEmail
          people={rowsOf<{ id: string; full_name: string; is_active?: boolean }>(peopleR.data)
            .filter((person) => person.is_active !== false)
            .map((person) => ({ id: person.id, name: person.full_name }))
            .sort((a, b) => a.name.localeCompare(b.name))}
          clients={rowsOf<{ id: string; name: string; email: string | null }>(clientsR.data)}
        />
      </details>

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

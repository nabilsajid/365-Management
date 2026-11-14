import { ActionButton, ApiForm } from '@/components/resource-manager';
import { getPageContext, peopleOptions, rowsOf } from '@/lib/page';
import { BROADCAST_MAX } from '@/lib/validation';
import type { Broadcast, Profile } from '@/types/database';

/**
 * Personal messages: an admin writes to one person; that person reads it and
 * marks it done. Admins see every message they have sent and whether it is done.
 */
export async function Messages() {
  const { supabase, orgId, userId, isAdmin, localDateTime } = await getPageContext();

  const [messagesR, peopleR] = await Promise.all([
    supabase.from('broadcasts').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(200),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
  ]);
  const people = rowsOf<Profile>(peopleR.data);
  const person = new Map(people.map((profile) => [profile.id, profile]));

  if (messagesR.error || (rowsOf<Broadcast>(messagesR.data)[0] && !('recipient_id' in rowsOf<Broadcast>(messagesR.data)[0]))) {
    return (
      <section className="panel">
        <p className="muted">
          Personal messages need a database update first. An admin has to run the file
          <code> 20261112000025_updates_messages.sql </code>
          in the Supabase SQL Editor, then reload this page.
        </p>
      </section>
    );
  }

  const all = rowsOf<Broadcast>(messagesR.data).filter((row) => row.recipient_id);
  // Row level security already limits employees to messages sent to them.
  const mine = all.filter((row) => row.recipient_id === userId);
  const sent = isAdmin ? all.filter((row) => row.recipient_id !== userId) : [];

  const list = (rows: Broadcast[], incoming: boolean) => (
    <ul className="message-list">
      {rows.map((row) => {
        const other = person.get(incoming ? row.sender_id : (row.recipient_id ?? ''));
        return (
          <li key={row.id} className={row.status === 'open' ? 'message message-open' : 'message'}>
            <div className="min-w-0 flex-1">
              <p className="message-meta">
                <strong>{incoming ? `From ${other?.full_name ?? 'an admin'}` : `To ${other?.full_name ?? '—'}`}</strong>
                {other?.job_title ? <span> · {other.job_title}</span> : null}
                <span> · {localDateTime(row.created_at)}</span>
              </p>
              <p className="message-body">{row.message}</p>
            </div>
            {row.status === 'open' ? (
              incoming ? (
                <ActionButton endpoint={`/api/broadcasts/${row.id}/done`} method="POST" primary>
                  Mark done
                </ActionButton>
              ) : (
                <span className="badge badge-pending">Not done yet</span>
              )
            ) : (
              <span className="badge badge-approved">Done</span>
            )}
          </li>
        );
      })}
    </ul>
  );

  return (
    <>
      {isAdmin ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Send a personal message</h2>
              <p className="muted">Only the person you choose sees it. They are notified straight away and can mark it done.</p>
            </div>
          </header>
          <ApiForm
            endpoint="/api/broadcasts"
            submitLabel="Send message"
            fields={[
              { name: 'recipient_id', label: 'To', type: 'select', required: true, options: peopleOptions(people.filter((profile) => profile.is_active && profile.id !== userId)) },
              { name: 'message', label: 'Message', type: 'textarea', required: true, placeholder: `Up to ${BROADCAST_MAX} characters.` },
            ]}
          />
        </section>
      ) : null}

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Messages for you</h2>
          </div>
        </header>
        {mine.length > 0 ? list(mine, true) : <p className="muted">No data found.</p>}
      </section>

      {isAdmin ? (
        <section className="panel">
          <header className="panel-header">
            <div>
              <h2>Messages you sent</h2>
            </div>
          </header>
          {sent.length > 0 ? list(sent, false) : <p className="muted">No data found.</p>}
        </section>
      ) : null}
    </>
  );
}

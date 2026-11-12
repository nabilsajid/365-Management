import { ApiForm, ResourceManager } from '@/components/resource-manager';
import { asRows, enumOptions, getPageContext, rowsOf } from '@/lib/page';
import { BROADCAST_MAX } from '@/lib/validation';
import type { Broadcast, Profile } from '@/types/database';

export default async function BroadcastsPage() {
  const { supabase, orgId, isAdmin, localDateTime } = await getPageContext();

  // Row level security returns every broadcast to admins and only your own to everyone else.
  const [broadcastsR, peopleR] = await Promise.all([
    supabase.from('broadcasts').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('*').eq('org_id', orgId),
  ]);
  const person = new Map(rowsOf<Profile>(peopleR.data).map((profile) => [profile.id, profile]));

  const rows = rowsOf<Broadcast>(broadcastsR.data).map((row) => ({
    ...row,
    sender_name: person.get(row.sender_id)?.full_name ?? '—',
    sender_role: person.get(row.sender_id)?.job_title ?? null,
    sent_on: localDateTime(row.created_at),
    resolved_by_name: row.resolved_by ? (person.get(row.resolved_by)?.full_name ?? '—') : null,
  }));
  const open = rows.filter((row) => row.status === 'open');
  const resolved = rows.filter((row) => row.status === 'resolved');

  const columns = [
    { key: 'sent_on', label: 'Sent' },
    ...(isAdmin
      ? [
          { key: 'sender_name', label: 'From' },
          { key: 'sender_role', label: 'Role' },
        ]
      : []),
    { key: 'message', label: 'Message' },
    { key: 'status', label: 'Status', kind: 'label' as const },
  ];
  const decide = [{ name: 'status', label: 'Status', type: 'select' as const, required: true, options: enumOptions(['open', 'resolved']) }];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Broadcasts</h1>
          <p className="muted">
            {isAdmin
              ? 'Urgent messages from the team. Use Edit on a message to mark it resolved.'
              : 'Need something urgently? Send a short message straight to the admins.'}
          </p>
        </div>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Send a broadcast</h2>
            <p className="muted">
              Up to {BROADCAST_MAX} characters. {isAdmin ? 'It goes to the admin inbox below; everyone on the team has this same form.' : 'Only admins can read it.'}
            </p>
          </div>
        </header>
        <ApiForm
          endpoint="/api/broadcasts"
          submitLabel={isAdmin ? 'Send broadcast' : 'Send to admins'}
          fields={[{ name: 'message', label: 'What do you need?', type: 'textarea', required: true, placeholder: 'The editing PC will not start and I have a delivery at 5pm.' }]}
        />
      </section>

      <ResourceManager
        title={isAdmin ? 'Open' : 'Waiting for a reply'}
        endpoint="/api/broadcasts"
        rows={asRows(open)}
        columns={columns}
        editFields={decide}
        canWrite={isAdmin}
        emptyText={isAdmin ? 'No open broadcasts.' : 'Nothing waiting.'}
      />
      <ResourceManager
        title="Resolved"
        endpoint="/api/broadcasts"
        rows={asRows(resolved)}
        columns={[...columns, { key: 'resolved_by_name', label: 'Resolved by' }]}
        editFields={decide}
        canWrite={isAdmin}
        emptyText="Nothing resolved yet."
      />
    </>
  );
}

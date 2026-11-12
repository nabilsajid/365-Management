import { ResourceManager } from '@/components/resource-manager';
import { sectionOf } from '@/lib/domain/changes';
import { asRows, getPageContext, rowsOf } from '@/lib/page';
import type { ChangeRequest, Profile } from '@/types/database';

// A person's own change requests and what the admin decided.
export default async function RequestsPage() {
  const { supabase, orgId, userId, localDateTime } = await getPageContext();

  const [requestsR, peopleR] = await Promise.all([
    supabase.from('change_requests').select('*').eq('org_id', orgId).eq('requested_by', userId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
  ]);
  const personName = new Map(rowsOf<Pick<Profile, 'id' | 'full_name'>>(peopleR.data).map((profile) => [profile.id, profile.full_name]));

  const rows = rowsOf<ChangeRequest>(requestsR.data).map((row) => ({
    ...row,
    section: sectionOf(row.path),
    sent_on: localDateTime(row.created_at),
    decided_by_name: row.decided_by ? (personName.get(row.decided_by) ?? '—') : null,
  }));

  const columns = [
    { key: 'sent_on', label: 'Sent' },
    { key: 'section', label: 'Section' },
    { key: 'summary', label: 'Change' },
    { key: 'status', label: 'Status', kind: 'label' as const },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Requests</h1>
          <p className="muted">Changes you made that need an admin&apos;s approval. Approved changes are applied; denied ones are dropped.</p>
        </div>
      </div>

      <ResourceManager
        title="Waiting for approval"
        endpoint="/api/change-requests"
        rows={asRows(rows.filter((row) => row.status === 'pending'))}
        columns={columns}
        emptyText="Nothing waiting."
      />
      <ResourceManager
        title="Decided"
        endpoint="/api/change-requests"
        rows={asRows(rows.filter((row) => row.status !== 'pending'))}
        columns={[...columns, { key: 'decided_by_name', label: 'Decided by' }, { key: 'decision_note', label: 'Note' }]}
        emptyText="No decisions yet."
      />
    </>
  );
}

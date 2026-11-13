import { ChangeSummary } from '@/components/change-summary';
import { changeDetails, sectionOf } from '@/lib/domain/changes';
import { label } from '@/lib/format';
import { getPageContext, rowsOf } from '@/lib/page';
import type { ChangeRequest, Profile } from '@/types/database';

// A person's own change requests and what the admin decided.
export default async function RequestsPage() {
  const { supabase, orgId, userId, localDateTime } = await getPageContext();

  // Names for the ids a request can mention. Row level security returns only what this person may see.
  const [requestsR, peopleR, ...namedR] = await Promise.all([
    supabase.from('change_requests').select('*').eq('org_id', orgId).eq('requested_by', userId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
    supabase.from('projects').select('id, name').eq('org_id', orgId),
    supabase.from('clients').select('id, name').eq('org_id', orgId),
    supabase.from('accounts').select('id, name').eq('org_id', orgId),
    supabase.from('fixed_expenses').select('id, name').eq('org_id', orgId),
  ]);
  const personName = new Map(rowsOf<Pick<Profile, 'id' | 'full_name'>>(peopleR.data).map((profile) => [profile.id, profile.full_name]));
  const named = new Map(namedR.flatMap((result) => rowsOf<{ id: string; name: string }>(result.data).map((row) => [row.id, row.name] as const)));
  const nameOf = (id: string) => personName.get(id) ?? named.get(id);

  const requests = rowsOf<ChangeRequest>(requestsR.data);
  const waiting = requests.filter((row) => row.status === 'pending');
  const decided = requests.filter((row) => row.status !== 'pending');

  const table = (rows: ChangeRequest[], withDecision: boolean) => (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Sent</th>
            <th>Section</th>
            <th>Change</th>
            <th>Status</th>
            {withDecision ? <th>Decided by</th> : null}
            {withDecision ? <th>Note</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{localDateTime(row.created_at)}</td>
              <td>{sectionOf(row.path)}</td>
              <td>
                <ChangeSummary details={changeDetails(row, nameOf)} />
              </td>
              <td>
                <span className={`badge badge-${row.status}`}>{label(row.status)}</span>
              </td>
              {withDecision ? <td>{row.decided_by ? (personName.get(row.decided_by) ?? '—') : '—'}</td> : null}
              {withDecision ? <td>{row.decision_note ?? '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1>My Requests</h1>
          <p className="muted">Changes you made that need an admin&apos;s approval. Approved changes are applied; denied ones are dropped.</p>
        </div>
      </div>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>
              Waiting for approval
              {waiting.length > 0 ? <span className="count">{waiting.length}</span> : null}
            </h2>
          </div>
        </header>
        {waiting.length > 0 ? table(waiting, false) : <p className="muted empty">Nothing waiting.</p>}
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Decided</h2>
          </div>
        </header>
        {decided.length > 0 ? table(decided, true) : <p className="muted empty">No decisions yet.</p>}
      </section>
    </>
  );
}

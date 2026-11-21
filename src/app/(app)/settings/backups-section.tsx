import { ActionButton } from '@/components/resource-manager';
import { getPageContext, rowsOf } from '@/lib/page';

/** Download everything now, and the weekly backups kept for eight weeks. */
export async function BackupsSection() {
  const { supabase, orgId, timeZone } = await getPageContext();
  const backupsR = await supabase.from('backups').select('id, rows, created_at').eq('org_id', orgId).order('created_at', { ascending: false });
  const backups = rowsOf<{ id: string; rows: number; created_at: string }>(backupsR.data);
  const when = new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Download everything</h2>
            <p className="muted">
              One Excel file with a sheet for every kind of record: clients, projects, deliverables, invoices, payments, costs,
              team, payroll, leave, attendance, points, equipment and more. Passwords and portal links are never included.
            </p>
          </div>
          <a className="button primary" href="/api/export/all" download>
            Download Excel
          </a>
        </header>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Weekly backups</h2>
            <p className="muted">
              A copy of all records is taken every week by itself and the latest eight are kept. Download one to see the records as
              they were that day. These copies live in the same database, so also keep a downloaded copy somewhere safe now and then.
            </p>
          </div>
          <ActionButton endpoint="/api/backups">Back up now</ActionButton>
        </header>
        {backupsR.error ? (
          <p className="muted">Backups arrive with the next database update. Reload this page in a minute.</p>
        ) : backups.length === 0 ? (
          <p className="muted">No backups yet. The first one is taken tonight, or press Back up now.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Taken</th>
                  <th className="num">Records</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {backups.map((row) => (
                  <tr key={row.id}>
                    <td>{when.format(new Date(row.created_at))}</td>
                    <td className="num">{row.rows}</td>
                    <td className="row-actions">
                      <a href={`/api/backups/${row.id}`} download>
                        Download
                      </a>
                      <ActionButton endpoint={`/api/backups/${row.id}`} method="DELETE">
                        Delete
                      </ActionButton>
                    </td>
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

import { ActionButton } from './resource-manager';

export interface CheckoutRow {
  id: string;
  item: string;
  holder: string;
  holderRole: string | null;
  mine: boolean;
  status: 'requested' | 'out' | 'returned' | 'declined' | 'cancelled';
  purpose: string | null;
  from: string;
  dueBack: string | null;
  returnedOn: string | null;
  /** Days taken so far (out) or in total (returned). */
  days: number | null;
  overdue: boolean;
  decidedBy: string | null;
  note: string | null;
  askedOn: string;
}

const STATUS: Record<CheckoutRow['status'], { text: string; badge: string }> = {
  requested: { text: 'Waiting', badge: 'badge badge-pending' },
  out: { text: 'Out', badge: 'badge badge-active' },
  returned: { text: 'Returned', badge: 'badge badge-approved' },
  declined: { text: 'Declined', badge: 'badge badge-rejected' },
  cancelled: { text: 'Cancelled', badge: 'badge' },
};

const short = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const span = (days: number | null) => (days === null ? '' : days === 0 ? 'today' : days === 1 ? '1 day' : `${days} days`);

/** Equipment checkouts as cards: the item, who has it, since when, for how long, and until when. */
export function CheckoutList({
  title,
  description,
  rows,
  manages,
  empty,
}: {
  title: string;
  description?: string;
  rows: CheckoutRow[];
  manages: boolean;
  empty: string;
}) {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>
            {title} {rows.length > 0 ? <span className="count">{rows.length}</span> : null}
          </h2>
          {description ? <p className="muted">{description}</p> : null}
        </div>
      </header>
      {rows.length === 0 ? (
        <p className="muted empty">{empty}</p>
      ) : (
        <ul className="checkout-list">
          {rows.map((row) => (
            <li key={row.id} className={row.overdue ? 'overdue' : undefined}>
              <div className="checkout-main">
                <p className="checkout-title">
                  <strong>{row.item}</strong> <span className={STATUS[row.status].badge}>{row.overdue ? 'Overdue' : STATUS[row.status].text}</span>
                </p>
                <p className="checkout-meta">
                  {row.holder}
                  {row.holderRole ? ` · ${row.holderRole}` : ''}
                  {row.purpose ? ` · ${row.purpose}` : ''}
                </p>
                <p className="checkout-dates">
                  {row.status === 'requested' ? (
                    <>
                      Wants it from {short(row.from)}
                      {row.dueBack ? ` to ${short(row.dueBack)}` : ''} · asked {short(row.askedOn)}
                    </>
                  ) : row.status === 'out' ? (
                    <>
                      Since {short(row.from)} ({span(row.days)})
                      {row.dueBack ? <> · {row.overdue ? <strong>was due back {short(row.dueBack)}</strong> : `back by ${short(row.dueBack)}`}</> : ' · no return date'}
                    </>
                  ) : row.status === 'returned' ? (
                    <>
                      {short(row.from)} to {row.returnedOn ? short(row.returnedOn) : '—'} ({span(row.days)})
                    </>
                  ) : (
                    <>Asked {short(row.askedOn)}{row.decidedBy ? ` · by ${row.decidedBy}` : ''}</>
                  )}
                </p>
                {row.note ? <p className="checkout-meta">Note: {row.note}</p> : null}
              </div>
              <div className="checkout-actions">
                {row.status === 'requested' && manages ? (
                  <>
                    <ActionButton endpoint={`/api/equipment-checkouts/${row.id}`} method="PATCH" body={{ action: 'approve' }} primary>
                      Approve
                    </ActionButton>
                    <ActionButton endpoint={`/api/equipment-checkouts/${row.id}`} method="PATCH" body={{ action: 'decline' }}>
                      Decline
                    </ActionButton>
                  </>
                ) : null}
                {row.status === 'requested' && row.mine && !manages ? (
                  <ActionButton endpoint={`/api/equipment-checkouts/${row.id}`} method="PATCH" body={{ action: 'cancel' }}>
                    Cancel request
                  </ActionButton>
                ) : null}
                {row.status === 'out' && (manages || row.mine) ? (
                  <ActionButton endpoint={`/api/equipment-checkouts/${row.id}`} method="PATCH" body={{ action: 'return' }}>
                    Mark returned
                  </ActionButton>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

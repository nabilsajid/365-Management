import { CheckCircle2 } from 'lucide-react';
import { TASK_KIND_LABEL, type DeliveryCount } from '@/lib/domain/deliverables';

/**
 * A monthly client's delivery counter for one month: per type, how many were
 * delivered (approved) against the target, or just the count when there is none.
 */
export function DeliveryTracker({ month, counts }: { month: string; counts: DeliveryCount[] }) {
  return (
    <section className="panel delivery-tracker" aria-labelledby="delivered-title">
      <header className="panel-header">
        <div>
          <h2 id="delivered-title">Delivered in {month}</h2>
          <p className="muted">Counted from this month&apos;s deliverables once they are approved.</p>
        </div>
      </header>
      {counts.length === 0 ? (
        <p className="muted empty">Nothing yet. Add this month&apos;s work below; it is counted here as it is approved.</p>
      ) : (
        <div className="delivery-grid">
          {counts.map((row) => {
            const met = row.target !== null && row.delivered >= row.target;
            const percent = row.target ? Math.min(100, Math.round((row.delivered / row.target) * 100)) : 0;
            return (
              <div key={row.kind} className={met ? 'delivery-tile met' : 'delivery-tile'}>
                <p className="delivery-label">{TASK_KIND_LABEL[row.kind]}</p>
                <p className="delivery-count">
                  <strong>{row.delivered}</strong>
                  {row.target !== null ? <span> / {row.target}</span> : null}
                </p>
                {row.target !== null ? (
                  <div className="delivery-bar" role="progressbar" aria-valuemin={0} aria-valuemax={row.target} aria-valuenow={row.delivered} aria-label={`${TASK_KIND_LABEL[row.kind]} delivered`}>
                    <div style={{ width: `${percent}%` }} />
                  </div>
                ) : null}
                <p className="delivery-note">
                  {met ? (
                    <>
                      <CheckCircle2 size={13} aria-hidden /> Target met
                    </>
                  ) : row.target !== null ? (
                    `${row.target - row.delivered} to go`
                  ) : (
                    'No fixed number'
                  )}
                  {row.inReview > 0 ? ` · ${row.inReview} in review` : ''}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

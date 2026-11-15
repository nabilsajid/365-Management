import { CheckCircle2 } from 'lucide-react';
import { TASK_KIND_LABEL, type DeliveryCount, type TaskKind } from '@/lib/domain/deliverables';

const two = (value: number) => String(value).padStart(2, '0');

/**
 * Delivered work for a monthly client, counted from approved tasks: per type,
 * this month's count (against the fixed number, if any) and the total so far.
 */
export function DeliveryTracker({
  month,
  counts,
  allTime,
}: {
  month: string;
  counts: DeliveryCount[];
  allTime: { kind: TaskKind; delivered: number }[];
}) {
  const kinds = [...new Set([...counts.map((row) => row.kind), ...allTime.map((row) => row.kind)])];
  return (
    <section className="panel delivery-tracker" aria-labelledby="delivered-title">
      <header className="panel-header">
        <div>
          <h2 id="delivered-title">Delivered</h2>
          <p className="muted">Counted by itself from approved tasks. {month} and the total since the start.</p>
        </div>
      </header>
      {kinds.length === 0 ? (
        <p className="muted empty">Nothing delivered yet. Each task counts here once it is approved.</p>
      ) : (
        <ul className="delivery-list">
          {kinds.map((kind) => {
            const row = counts.find((item) => item.kind === kind);
            const delivered = row?.delivered ?? 0;
            const target = row?.target ?? null;
            const met = target !== null && delivered >= target;
            const total = allTime.find((item) => item.kind === kind)?.delivered ?? 0;
            return (
              <li key={kind} className={met ? 'met' : undefined}>
                <span className="delivery-name">{TASK_KIND_LABEL[kind]} delivered</span>
                <span className="delivery-figure">
                  <strong>{two(delivered)}</strong>
                  {target !== null ? <span> / {two(target)}</span> : null}
                  {met ? <CheckCircle2 size={15} aria-label="Fixed number reached" /> : null}
                </span>
                <span className="delivery-extra">
                  {row && row.inReview > 0 ? `${row.inReview} in review · ` : ''}
                  {total} in total
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

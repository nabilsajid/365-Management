// How close a deadline is, for the marks people see on their tasks.

export type DueState = 'overdue' | 'today' | 'soon' | null;

const DAY = 86_400_000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);

/** Overdue, due today, or due within two days. Finished or submitted work has no state. */
export function dueState(due: string | null | undefined, today: string, status?: string | null): DueState {
  if (!due || status === 'approved' || status === 'submitted') return null;
  const left = days(today, due.slice(0, 10));
  if (left < 0) return 'overdue';
  if (left === 0) return 'today';
  if (left <= 2) return 'soon';
  return null;
}

/** The words on the mark: "Overdue", "Due today", "Due tomorrow", "Due in 2 days". */
export function dueLabel(due: string, today: string, state: DueState): string {
  if (state === 'overdue') return 'Overdue';
  if (state === 'today') return 'Due today';
  if (state === 'soon') return days(today, due.slice(0, 10)) === 1 ? 'Due tomorrow' : 'Due in 2 days';
  return '';
}

/** The last day counted as "near" for the sidebar marker. */
export function soonLimit(today: string): string {
  return new Date(Date.parse(`${today}T00:00:00Z`) + 2 * DAY).toISOString().slice(0, 10);
}

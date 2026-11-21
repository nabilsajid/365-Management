/** Work KPIs worked out from deliverables and their reviews. */

export interface KpiSubmission {
  task_id: string;
  review_status: string;
  reviewed_at: string | null;
  created_at: string;
}

export interface KpiTask {
  id: string;
  due_date: string | null;
}

export interface DeliveryStats {
  /** Deliverables approved in the month. */
  approved: number;
  /** Of those with a due date, how many were approved on or before it. */
  withDue: number;
  onTime: number;
  /** Approved without ever being sent back for changes. */
  firstTime: number;
}

/** The month (YYYY-MM-01) an ISO time falls in, in a time zone. */
export function monthOf(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-01`;
}

function dayOf(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/**
 * Per month: deliverables approved, how many on time, and how many were approved
 * the first time they were sent. A deliverable counts in the month of its first approval.
 */
export function deliveryStats(tasks: KpiTask[], submissions: KpiSubmission[], timeZone: string): Map<string, DeliveryStats> {
  const due = new Map(tasks.map((task) => [task.id, task.due_date]));
  const byTask = new Map<string, KpiSubmission[]>();
  for (const row of submissions) {
    if (!due.has(row.task_id)) continue;
    const list = byTask.get(row.task_id) ?? [];
    list.push(row);
    byTask.set(row.task_id, list);
  }
  const result = new Map<string, DeliveryStats>();
  for (const [taskId, list] of byTask) {
    list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const firstApproved = list.findIndex((row) => row.review_status === 'approved' && row.reviewed_at);
    if (firstApproved < 0) continue;
    const approvedAt = list[firstApproved].reviewed_at as string;
    const month = monthOf(approvedAt, timeZone);
    const stats = result.get(month) ?? { approved: 0, withDue: 0, onTime: 0, firstTime: 0 };
    stats.approved += 1;
    if (!list.slice(0, firstApproved).some((row) => row.review_status === 'changes_requested')) stats.firstTime += 1;
    const dueDate = due.get(taskId);
    if (dueDate) {
      stats.withDue += 1;
      if (dayOf(approvedAt, timeZone) <= dueDate) stats.onTime += 1;
    }
    result.set(month, stats);
  }
  return result;
}

/** A share as a whole percentage, or null when there is nothing to measure. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** The `count` months ending with `last` (YYYY-MM-01), oldest first. */
export function monthsEnding(last: string, count: number): string[] {
  const [year, month] = last.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (count - 1 - index), 1));
    return date.toISOString().slice(0, 10);
  });
}

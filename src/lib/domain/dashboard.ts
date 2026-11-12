// Pure helpers behind the admin dashboard. No I/O, so they are unit tested.

/** The `count` months ending with `month` (YYYY-MM-01), oldest first. */
export function lastMonths(month: string, count: number): string[] {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const months: string[] = [];
  for (let back = count - 1; back >= 0; back -= 1) {
    const total = year * 12 + index - back;
    months.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`);
  }
  return months;
}

export interface CashflowPoint {
  month: string;
  income: number;
  expenses: number;
}

/** Money received and spent per month. Entries outside the given months are ignored. */
export function bucketCashflow(
  months: string[],
  payments: { amount: number | string; paid_on: string }[],
  expenses: { amount: number | string | null; expense_date: string }[],
): CashflowPoint[] {
  const points = new Map<string, CashflowPoint>(
    months.map((month) => [month.slice(0, 7), { month, income: 0, expenses: 0 }]),
  );
  for (const payment of payments) {
    const point = points.get(payment.paid_on.slice(0, 7));
    if (point) point.income += Number(payment.amount);
  }
  for (const expense of expenses) {
    const point = points.get(expense.expense_date.slice(0, 7));
    if (point) point.expenses += Number(expense.amount ?? 0);
  }
  return [...points.values()];
}

export interface ProjectProgress {
  id: string;
  name: string;
  status: string;
  due_date: string | null;
  total: number;
  approved: number;
  percent: number;
}

/** Share of approved deliverables for each project that is still running. */
export function projectProgress(
  projects: { id: string; name: string; status: string; due_date: string | null }[],
  tasks: { project_id: string; status: string }[],
): ProjectProgress[] {
  return projects
    .filter((project) => project.status === 'onboarding' || project.status === 'active')
    .map((project) => {
      const own = tasks.filter((task) => task.project_id === project.id);
      const approved = own.filter((task) => task.status === 'approved').length;
      return {
        id: project.id,
        name: project.name,
        status: project.status,
        due_date: project.due_date,
        total: own.length,
        approved,
        percent: own.length === 0 ? 0 : Math.round((approved / own.length) * 100),
      };
    });
}

export interface Deadline {
  kind: 'task' | 'project';
  id: string;
  title: string;
  context: string | null;
  due_date: string;
  overdue: boolean;
}

/** Unfinished tasks and projects that have a due date, soonest (and overdue) first. */
export function upcomingDeadlines(
  today: string,
  projects: { id: string; name: string; status: string; due_date: string | null }[],
  tasks: { id: string; project_id: string; title: string; status: string; due_date: string | null }[],
  limit = 6,
): Deadline[] {
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const deadlines: Deadline[] = [];
  for (const task of tasks) {
    if (!task.due_date || task.status === 'approved') continue;
    deadlines.push({
      kind: 'task',
      id: task.id,
      title: task.title,
      context: projectName.get(task.project_id) ?? null,
      due_date: task.due_date,
      overdue: task.due_date < today,
    });
  }
  for (const project of projects) {
    if (!project.due_date || project.status === 'completed' || project.status === 'archived') continue;
    deadlines.push({
      kind: 'project',
      id: project.id,
      title: project.name,
      context: null,
      due_date: project.due_date,
      overdue: project.due_date < today,
    });
  }
  return deadlines.sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, limit);
}

export interface ActivityItem {
  kind: 'submission' | 'payment' | 'expense';
  id: string;
  title: string;
  detail: string | null;
  amount: number | null;
  at: string;
  href: string;
}

/** Newest first, across every kind of activity. */
export function mergeActivity(items: ActivityItem[], limit = 8): ActivityItem[] {
  return [...items].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

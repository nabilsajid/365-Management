import type { SupabaseClient } from '@supabase/supabase-js';
import {
  bucketCashflow,
  lastMonths,
  mergeActivity,
  projectProgress,
  upcomingDeadlines,
  type ActivityItem,
  type CashflowPoint,
  type Deadline,
  type ProjectProgress,
} from '../domain/dashboard';
import { dateInZone, monthStart, nextMonth } from '../domain/points';

export interface Dashboard {
  month: string;
  today: string;
  funds: number;
  outstanding: number;
  activeProjects: number;
  pendingTasks: number;
  expensesThisMonth: number;
  fixedMonthly: number;
  equipment: { count: number; value: number; unpriced: number };
  projects: Record<string, number>;
  tasks: Record<string, number>;
  approvals: { submissions: number; attendance: number; bonuses: number };
  cashflow: CashflowPoint[];
  progress: ProjectProgress[];
  deadlines: Deadline[];
  activity: ActivityItem[];
}

type Rows = Record<string, unknown>[];

const sum = (rows: Rows | null, key: string) =>
  (rows ?? []).reduce((total, row) => total + Number(row[key] ?? 0), 0);

function countBy(rows: Rows | null, key: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows ?? []) {
    const value = String(row[key]);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

const KIND_LABEL: Record<string, string> = { drive: 'Google Drive link', dropbox: 'Dropbox link', text: 'Text note' };

/** Combined financial and operational overview for the admin dashboard. */
export async function getDashboard(
  supabase: SupabaseClient,
  orgId: string,
  timeZone: string,
): Promise<Dashboard> {
  const now = new Date();
  const month = monthStart(now, timeZone);
  const today = dateInZone(now, timeZone);
  const months = lastMonths(month, 6);
  const from = months[0];
  const until = nextMonth(month);

  const [
    balances, invoices, invoiceBalances, payments, expenses, fixed, equipment,
    projects, tasks, people, pendingSubmissions, pendingAttendance, pendingBonuses,
    recentSubmissions, recentPayments, recentExpenses,
  ] = await Promise.all([
    supabase.from('account_balances').select('balance').eq('org_id', orgId),
    supabase.from('invoices').select('id, invoice_number, status').eq('org_id', orgId),
    supabase.from('invoice_balances').select('invoice_id, outstanding').eq('org_id', orgId),
    supabase.from('payments').select('amount, paid_on').eq('org_id', orgId).gte('paid_on', from).lt('paid_on', until),
    supabase.from('expenses').select('amount, expense_date').eq('org_id', orgId).gte('expense_date', from).lt('expense_date', until),
    supabase.from('fixed_expenses').select('monthly_amount').eq('org_id', orgId).eq('is_active', true),
    supabase.from('equipment').select('purchase_price, status').eq('org_id', orgId),
    supabase.from('projects').select('id, name, status, due_date').eq('org_id', orgId),
    supabase.from('tasks').select('id, project_id, title, status, due_date').eq('org_id', orgId),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
    supabase.from('task_submissions').select('id').eq('org_id', orgId).eq('review_status', 'pending'),
    supabase.from('attendance').select('id').eq('org_id', orgId).eq('status', 'pending'),
    supabase.from('bonuses').select('id').eq('org_id', orgId).eq('status', 'pending'),
    supabase.from('task_submissions').select('id, task_id, submitted_by, kind, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(6),
    supabase.from('payments').select('id, invoice_id, amount, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(6),
    supabase.from('expenses').select('id, description, category, amount, created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(6),
  ]);

  const projectRows = (projects.data ?? []) as { id: string; name: string; status: string; due_date: string | null }[];
  const taskRows = (tasks.data ?? []) as { id: string; project_id: string; title: string; status: string; due_date: string | null }[];
  const invoiceRows = (invoices.data ?? []) as { id: string; invoice_number: string; status: string }[];

  const voided = new Set(invoiceRows.filter((invoice) => invoice.status === 'void').map((invoice) => invoice.id));
  const outstanding = ((invoiceBalances.data ?? []) as { invoice_id: string; outstanding: number }[])
    .filter((row) => !voided.has(row.invoice_id))
    .reduce((total, row) => total + Math.max(0, Number(row.outstanding)), 0);

  const gear = ((equipment.data ?? []) as { purchase_price: number | null; status: string }[]).filter(
    (item) => item.status !== 'retired',
  );

  const cashflow = bucketCashflow(
    months,
    (payments.data ?? []) as { amount: number; paid_on: string }[],
    (expenses.data ?? []) as { amount: number | null; expense_date: string }[],
  );

  const personName = new Map(((people.data ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));
  const taskTitle = new Map(taskRows.map((task) => [task.id, task.title]));
  const invoiceNumber = new Map(invoiceRows.map((invoice) => [invoice.id, invoice.invoice_number]));

  const activity = mergeActivity([
    ...((recentSubmissions.data ?? []) as { id: string; task_id: string; submitted_by: string; kind: string; created_at: string }[]).map(
      (row): ActivityItem => ({
        kind: 'submission',
        id: row.id,
        title: `${personName.get(row.submitted_by) ?? 'Someone'} submitted ${taskTitle.get(row.task_id) ?? 'a task'}`,
        detail: KIND_LABEL[row.kind] ?? row.kind,
        amount: null,
        at: row.created_at,
        href: `/tasks/${row.task_id}`,
      }),
    ),
    ...((recentPayments.data ?? []) as { id: string; invoice_id: string; amount: number; created_at: string }[]).map(
      (row): ActivityItem => ({
        kind: 'payment',
        id: row.id,
        title: `Payment received for ${invoiceNumber.get(row.invoice_id) ?? 'an invoice'}`,
        detail: null,
        amount: Number(row.amount),
        at: row.created_at,
        href: '/cashflow',
      }),
    ),
    ...((recentExpenses.data ?? []) as { id: string; description: string; category: string; amount: number | null; created_at: string }[]).map(
      (row): ActivityItem => ({
        kind: 'expense',
        id: row.id,
        title: row.description,
        detail: row.category === 'equipment' ? 'Equipment purchase' : `${row.category.charAt(0).toUpperCase()}${row.category.slice(1)} expense`,
        amount: row.amount === null ? null : Number(row.amount),
        at: row.created_at,
        href: '/cashflow',
      }),
    ),
  ]);

  return {
    month,
    today,
    funds: sum(balances.data, 'balance'),
    outstanding,
    activeProjects: projectRows.filter((project) => project.status === 'active' || project.status === 'onboarding').length,
    pendingTasks: taskRows.filter((task) => task.status !== 'approved').length,
    expensesThisMonth: cashflow[cashflow.length - 1]?.expenses ?? 0,
    fixedMonthly: sum(fixed.data, 'monthly_amount'),
    equipment: {
      count: gear.length,
      value: gear.reduce((total, item) => total + Number(item.purchase_price ?? 0), 0),
      unpriced: gear.filter((item) => item.purchase_price === null).length,
    },
    projects: countBy(projects.data, 'status'),
    tasks: countBy(tasks.data, 'status'),
    approvals: {
      submissions: pendingSubmissions.data?.length ?? 0,
      attendance: pendingAttendance.data?.length ?? 0,
      bonuses: pendingBonuses.data?.length ?? 0,
    },
    cashflow,
    progress: projectProgress(projectRows, taskRows),
    deadlines: upcomingDeadlines(today, projectRows, taskRows),
    activity,
  };
}

import type { ResourceConfig } from './crud';
import { accessForRole } from '../domain/roles';
import * as v from '../validation';

// One entry per table exposed through the generic CRUD handlers.
// Anything with `read: 'admin'` is cash-flow data that employees never see.

const now = () => new Date().toISOString();

export const clients: ResourceConfig = {
  table: 'clients',
  createSchema: v.clientCreate,
  updateSchema: v.clientUpdate,
  orderBy: { column: 'name', ascending: true },
};

export const projects: ResourceConfig = {
  table: 'projects',
  select: '*, client:clients(id, name)',
  updateSchema: v.projectUpdate,
  filters: ['client_id', 'status'],
};

export const tasks: ResourceConfig = {
  table: 'tasks',
  select: '*, assignee:profiles(id, full_name, job_title)',
  createSchema: v.taskCreate,
  updateSchema: v.taskUpdate,
  filters: ['project_id', 'assignee_id', 'status'],
  orderBy: { column: 'position', ascending: true },
};

export const submissions: ResourceConfig = {
  table: 'task_submissions',
  updateSchema: v.submissionReview,
  onUpdate: (ctx, data) =>
    data.review_status === 'pending'
      ? { reviewed_by: null, reviewed_at: null }
      : { reviewed_by: ctx.userId, reviewed_at: now() },
};

export const equipment: ResourceConfig = {
  table: 'equipment',
  select: '*, holder:profiles(id, full_name, job_title)',
  createSchema: v.equipmentCreate,
  updateSchema: v.equipmentUpdate,
  filters: ['status', 'current_holder_id'],
  orderBy: { column: 'name', ascending: true },
};

export const fixedExpenses: ResourceConfig = {
  table: 'fixed_expenses',
  read: 'admin',
  createSchema: v.fixedExpenseCreate,
  updateSchema: v.fixedExpenseUpdate,
  orderBy: { column: 'name', ascending: true },
};

export const expenses: ResourceConfig = {
  table: 'expenses',
  read: 'admin',
  createSchema: v.expenseCreate,
  updateSchema: v.expenseUpdate,
  filters: ['category', 'account_id', 'fixed_expense_id'],
  orderBy: { column: 'expense_date', ascending: false },
  onCreate: (ctx) => ({ created_by: ctx.userId }),
};

export const accounts: ResourceConfig = {
  table: 'accounts',
  read: 'admin',
  createSchema: v.accountCreate,
  updateSchema: v.accountUpdate,
  orderBy: { column: 'name', ascending: true },
};

export const invoices: ResourceConfig = {
  table: 'invoices',
  read: 'admin',
  createSchema: v.invoiceCreate,
  updateSchema: v.invoiceUpdate,
  filters: ['client_id', 'project_id', 'status'],
  orderBy: { column: 'issue_date', ascending: false },
};

export const payments: ResourceConfig = {
  table: 'payments',
  read: 'admin',
  createSchema: v.paymentCreate,
  updateSchema: v.paymentUpdate,
  filters: ['invoice_id', 'account_id'],
  orderBy: { column: 'paid_on', ascending: false },
};

export const employees: ResourceConfig = {
  table: 'profiles',
  updateSchema: v.employeeUpdate,
  orderBy: { column: 'full_name', ascending: true },
  // Changing someone's job role changes their access with it.
  onUpdate: (_ctx, data) => ('job_title' in data ? { access_role: accessForRole(data.job_title) } : {}),
};

export const attendance: ResourceConfig = {
  table: 'attendance',
  updateSchema: v.attendanceUpdate,
  filters: ['employee_id', 'status', 'work_date'],
  orderBy: { column: 'work_date', ascending: false },
  onUpdate: (ctx, data) => {
    if (!('status' in data)) return {};
    return data.status === 'verified'
      ? { verified_by: ctx.userId, verified_at: now() }
      : { verified_by: null, verified_at: null };
  },
};

export const violationTypes: ResourceConfig = {
  table: 'violation_types',
  createSchema: v.violationTypeCreate,
  updateSchema: v.violationTypeUpdate,
  orderBy: { column: 'name', ascending: true },
};

export const pointEntries: ResourceConfig = {
  table: 'point_entries',
  updateSchema: v.pointEntryUpdate,
  filters: ['employee_id', 'period_month', 'source'],
};

export const bonuses: ResourceConfig = {
  table: 'bonuses',
  updateSchema: v.bonusDecision,
  filters: ['employee_id', 'period_month', 'status'],
  orderBy: { column: 'period_month', ascending: false },
  onUpdate: (ctx, data) =>
    data.status === 'pending'
      ? { decided_by: null, decided_at: null }
      : { decided_by: ctx.userId, decided_at: now() },
};

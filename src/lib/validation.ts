import { z } from 'zod';
import { JOB_ROLES } from './domain/roles';
import { submissionProblem } from './domain/submissions';

// Input schemas for the API routes, one group per module.

const id = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD.');
const text = z.string().trim().min(1, 'This field is required.');
const optionalText = z.string().trim().nullish();
const money = z.number().finite().nonnegative();
const points = z.number().int().nonnegative();

export const fileLink = z.object({
  label: text,
  url: z.string().url().refine((value) => /^https?:\/\//.test(value), 'Links must start with http(s)://.'),
});

// --- Module 1: projects and clients -----------------------------------------

export const clientCreate = z.object({
  name: text,
  contact_name: optionalText,
  email: z.string().trim().email().nullish(),
  phone: optionalText,
  notes: optionalText,
});
export const clientUpdate = clientCreate.partial();

const taskFields = {
  title: text,
  description: optionalText,
  file_links: z.array(fileLink).max(50).optional(),
  assignee_id: id.nullish(),
  points_value: points.nullish(),
  due_date: date.nullish(),
};

export const deliverable = z.object(taskFields);

export const projectStatus = z.enum(['onboarding', 'active', 'completed', 'archived']);

const projectFields = {
  client_id: id,
  name: text,
  brief: optionalText,
  status: projectStatus.optional(),
  start_date: date.nullish(),
  due_date: date.nullish(),
};

export const projectCreate = z.object({
  ...projectFields,
  deliverables: z.array(deliverable).max(100).default([]),
});
export const projectUpdate = z.object(projectFields).partial();

export const taskStatus = z.enum(['todo', 'in_progress', 'submitted', 'changes_requested', 'approved']);

export const taskCreate = z.object({
  ...taskFields,
  project_id: id,
  status: taskStatus.optional(),
  position: z.number().int().nonnegative().optional(),
});
export const taskUpdate = z
  .object({ ...taskFields, status: taskStatus, position: z.number().int().nonnegative() })
  .partial();

export const submissionCreate = z
  .object({
    kind: z.enum(['drive', 'dropbox', 'text']),
    url: z.string().trim().nullish(),
    note: optionalText,
  })
  .superRefine((value, ctx) => {
    const problem = submissionProblem(value);
    if (problem) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem, path: [value.kind === 'text' ? 'note' : 'url'] });
    }
  });

export const submissionReview = z.object({
  review_status: z.enum(['pending', 'approved', 'changes_requested']),
  review_note: optionalText,
});

// --- Module 2: logistics and costs ------------------------------------------

export const equipmentCreate = z.object({
  name: text,
  category: optionalText,
  serial_number: optionalText,
  purchase_price: money.nullish(),
  purchase_date: date.nullish(),
  status: z.enum(['available', 'in_use', 'maintenance', 'retired']).optional(),
  current_holder_id: id.nullish(),
  notes: optionalText,
});
export const equipmentUpdate = equipmentCreate.partial();

export const fixedExpenseCreate = z.object({
  name: text,
  kind: z.enum(['rent', 'utilities', 'other']).optional(),
  monthly_amount: money,
  is_active: z.boolean().optional(),
});
export const fixedExpenseUpdate = fixedExpenseCreate.partial();

// --- Module 3: cash flow and invoices ---------------------------------------

export const accountCreate = z.object({
  name: text,
  kind: z.enum(['cash', 'bank', 'mobile_wallet']).optional(),
  opening_balance: z.number().finite().optional(),
});
export const accountUpdate = accountCreate.partial();

export const invoiceCreate = z.object({
  client_id: id,
  project_id: id.nullish(),
  invoice_number: text,
  issue_date: date.optional(),
  due_date: date.nullish(),
  amount: z.number().finite().positive(),
  status: z.enum(['draft', 'sent', 'void']).optional(),
  notes: optionalText,
});
export const invoiceUpdate = invoiceCreate.partial();

export const paymentCreate = z.object({
  invoice_id: id,
  account_id: id,
  amount: z.number().finite().positive(),
  paid_on: date.optional(),
  method: optionalText,
  note: optionalText,
});
export const paymentUpdate = paymentCreate.partial();

const expenseFields = z.object({
  category: z.enum(['general', 'equipment', 'fixed', 'transport']).default('general'),
  description: text,
  amount: money.nullish(),
  expense_date: date.optional(),
  account_id: id.nullish(),
  fixed_expense_id: id.nullish(),
  trip_origin: optionalText,
  trip_destination: optionalText,
  traveler_id: id.nullish(),
});

export const expenseCreate = expenseFields.superRefine((value, ctx) => {
  // Only an equipment purchase may be recorded before its price is known.
  if (value.category !== 'equipment' && (value.amount === null || value.amount === undefined)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'An amount is required.', path: ['amount'] });
  }
  if (value.category === 'transport' && (!value.trip_origin || !value.trip_destination)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A transport expense needs where the trip started and ended.',
      path: [value.trip_origin ? 'trip_destination' : 'trip_origin'],
    });
  }
  if (value.fixed_expense_id && value.category !== 'fixed') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Only a fixed expense can be linked to a fixed monthly cost.',
      path: ['fixed_expense_id'],
    });
  }
});
// The database constraints re-check the combined row on update.
export const expenseUpdate = expenseFields.partial();

// --- Module 4: employees and rewards ----------------------------------------

// Access is not an input: it follows the job role (only "Admin" has admin access).
const jobRole = z.enum(JOB_ROLES, { message: 'Choose a role from the list.' });

export const employeeInvite = z.object({
  email: z.string().trim().email(),
  full_name: text,
  job_title: jobRole,
});
export const employeeUpdate = z
  .object({
    full_name: text,
    job_title: jobRole,
    is_active: z.boolean(),
  })
  .partial();

export const attendanceStatus = z.enum(['pending', 'verified', 'rejected']);
export const attendanceCreate = z.object({
  work_date: date,
  employee_id: id.optional(),
  status: attendanceStatus.optional(),
  note: optionalText,
});
export const attendanceUpdate = z
  .object({ work_date: date, status: attendanceStatus, note: optionalText })
  .partial();

export const violationTypeCreate = z.object({
  name: text,
  deduction_points: z.number().int().positive(),
  is_active: z.boolean().optional(),
});
export const violationTypeUpdate = violationTypeCreate.partial();

const month = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, 'Use the format YYYY-MM.');

export const pointEntryCreate = z
  .object({
    source: z.enum(['violation', 'adjustment']),
    employee_id: id,
    month: month.nullish(),
    violation_type_id: id.nullish(),
    points: z.number().int().nullish(),
    reason: text,
  })
  .superRefine((value, ctx) => {
    if (value.source === 'adjustment' && !value.points) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'An adjustment needs a non-zero number of points.', path: ['points'] });
    }
    if (value.source === 'violation' && !value.violation_type_id && !value.points) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Choose a violation type or enter the points to deduct.',
        path: ['violation_type_id'],
      });
    }
  });
export const pointEntryUpdate = z
  .object({ points: z.number().int().refine((value) => value !== 0, 'Points cannot be zero.'), reason: optionalText })
  .partial();

export const pointSettingsUpdate = z
  .object({
    monthly_target: points,
    attendance_points: points,
    default_task_points: points,
    bonus_step_points: z.number().int().positive(),
    bonus_step_amount: money,
  })
  .partial();

export const bonusCalculate = z.object({ month });
export const bonusDecision = z.object({ status: z.enum(['pending', 'approved', 'rejected']) });

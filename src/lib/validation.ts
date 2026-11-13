import { z } from 'zod';
import { NOTICE_DURATION_VALUES } from './domain/notices';
import { ROLE_COLORS, SEGMENT_KEYS } from './domain/roles';
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

// A project needs only a name. The client is optional and given by name; the
// team and links belong to the project itself.
const projectFields = {
  name: text,
  client_name: optionalText,
  brief: optionalText,
  status: projectStatus.optional(),
  start_date: date.nullish(),
  due_date: date.nullish(),
  file_links: z.array(fileLink).max(50).optional(),
  member_ids: z.array(id).max(100).optional(),
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
  condition: z.enum(['perfect', 'moderate', 'weak']).nullish(),
  notes: optionalText,
});
export const equipmentUpdate = equipmentCreate.partial();

export const equipmentNeedCreate = z.object({
  item_name: text,
  quantity: z.number().int().positive().max(999).default(1),
  note: optionalText,
});
export const equipmentNeedUpdate = z
  .object({
    item_name: text,
    quantity: z.number().int().positive().max(999),
    note: optionalText,
    status: z.enum(['needed', 'acquired']),
  })
  .partial();

export const BROADCAST_MAX = 280;
export const broadcastCreate = z.object({
  message: z.string().trim().min(1, 'Write a message.').max(BROADCAST_MAX, `Keep it under ${BROADCAST_MAX} characters.`),
});
export const broadcastUpdate = z.object({ status: z.enum(['open', 'resolved']) });

// --- Personal profiles and the notice board ------------------------------------

// A Bangladeshi mobile number: starts with 01 and has 11 digits. Spaces and dashes are dropped.
export const BD_PHONE = /^01\d{9}$/;
const phone = z
  .string()
  .transform((value) => value.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(BD_PHONE, 'Enter a valid mobile number: 11 digits starting with 01, for example 01700000000.'));

// The same fields whether a person fills in their own profile or an admin edits it.
export const profileUpdate = z.object({
  full_name: text.max(120),
  nickname: z.string().trim().max(60).nullish(),
  contact: phone,
  address: z.string().trim().max(300).nullish(),
  secondary_contact: phone.nullish(),
});

const noticeFields = {
  title: text.max(120, 'Keep the title under 120 characters.'),
  body: z.string().trim().max(2000, 'Keep the notice under 2000 characters.').nullish(),
  is_urgent: z.boolean().optional(),
};
export const noticeCreate = z.object({ ...noticeFields, duration: z.enum(NOTICE_DURATION_VALUES) });
// Choosing a duration when editing restarts the clock from now; leaving it out keeps the current expiry.
export const noticeUpdate = z.object({ ...noticeFields, duration: z.enum(NOTICE_DURATION_VALUES).nullish() }).partial();

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
  // What a trip was for: a project, a client, or a purpose typed in by hand.
  project_id: id.nullish(),
  client_id: id.nullish(),
  purpose: z.string().trim().max(200).nullish(),
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

// Access is not an input: it follows the roles a person holds.
const roleIds = z.array(id).min(1, 'Choose at least one role.').max(20);

const loginPassword = z.string().min(6, 'Use at least 6 characters.').max(72, 'Use at most 72 characters.');
const phoneNumber = phone;

// An admin adds a person with the email they will sign in with. Leaving the
// password empty has the server choose one.
export const employeeCreate = z.object({
  email: z.string().trim().toLowerCase().email(),
  full_name: text,
  role_ids: roleIds,
  password: loginPassword.nullish(),
});
// An admin can change anything about a person. `is_active: false` suspends them: they cannot sign in.
export const employeeUpdate = z
  .object({
    full_name: text,
    role_ids: roleIds,
    is_active: z.boolean(),
    email: z.string().trim().toLowerCase().email().nullable(),
    nickname: z.string().trim().max(60).nullable(),
    contact: phoneNumber.nullable(),
    secondary_contact: phoneNumber.nullable(),
    address: z.string().trim().max(300).nullable(),
  })
  .partial();

export const changeDecision = z.object({
  decision: z.enum(['approve', 'deny']),
  note: optionalText,
});

export const roleCreate = z.object({
  name: text,
  description: optionalText,
  color: z.enum(ROLE_COLORS).optional(),
  permissions: z.array(z.enum(SEGMENT_KEYS)).max(SEGMENT_KEYS.length).default([]),
});
export const roleUpdate = z
  .object({
    name: text,
    description: optionalText,
    color: z.enum(ROLE_COLORS),
    permissions: z.array(z.enum(SEGMENT_KEYS)).max(SEGMENT_KEYS.length),
  })
  .partial();

export const attendanceStatus = z.enum(['pending', 'verified', 'rejected']);

// "09:30" or "09:30:00". Comparing the first five characters as text orders times correctly.
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use a time like 09:30.');
const exitAfterEntry = (value: { check_in?: string | null; check_out?: string | null }, ctx: z.RefinementCtx) => {
  if (value.check_in && value.check_out && value.check_out.slice(0, 5) <= value.check_in.slice(0, 5)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'The exit time must be after the entry time.', path: ['check_out'] });
  }
};

export const attendanceCreate = z
  .object({
    work_date: date,
    employee_id: id.optional(),
    status: attendanceStatus.optional(),
    check_in: clock.nullish(),
    check_out: clock.nullish(),
    note: optionalText,
  })
  .superRefine(exitAfterEntry);
export const attendanceUpdate = z
  .object({ work_date: date, status: attendanceStatus, check_in: clock.nullable(), check_out: clock.nullable(), note: optionalText })
  .partial()
  .superRefine(exitAfterEntry);

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

// --- Forgotten passwords -----------------------------------------------------

export const passwordRequestCreate = z.object({
  email: z.string().trim().toLowerCase().email('Enter the email you sign in with.'),
});

export const PASSWORD_MIN = 6;
const password = z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(72, 'Use at most 72 characters.');

// An admin sets a password for one person.
export const passwordSet = z.object({ password });
// An admin chooses a new password from the reset link emailed to them.
export const passwordReset = z.object({ access_token: z.string().min(20).max(4096), password });
export const passwordRequestResolve = z
  .object({
    action: z.enum(['set', 'dismiss']),
    password: z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(72).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.action === 'set' && !value.password) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter the new password.', path: ['password'] });
    }
  });

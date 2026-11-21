import { z } from 'zod';
import { OPTIONAL_SECTIONS } from './domain/sections';
import { TASK_KINDS } from './domain/deliverables';
import { CORNERS } from './domain/appearance';
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
  kind: z.enum(TASK_KINDS).optional(),
};

const dueDay = z.coerce.number().int('Use a whole day.').min(1, 'Use a day from 1 to 31.').max(31, 'Use a day from 1 to 31.');

// In a new project a thumbnail points at its video by position in the list.
// In a monthly project the deliverables are its package, due on a day of each month.
export const deliverable = z.object({ ...taskFields, for_index: z.number().int().nonnegative().nullish(), due_day: dueDay.nullish() });

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
  // Whether the shoot is still waiting for the client, and its date once confirmed.
  shoot_status: z.enum(['none', 'waiting', 'confirmed']).optional(),
  shoot_date: date.nullish(),
  file_links: z.array(fileLink).max(50).optional(),
  member_ids: z.array(id).max(100).optional(),
  // One-time, or a monthly client: one project with a month for each calendar month.
  kind: z.enum(['one_time', 'monthly']).optional(),
  // A monthly client's fee: when set, each month's invoice is drafted automatically.
  monthly_fee: z.coerce.number().positive('Use an amount above 0.').max(100000000000).nullish().or(z.literal('').transform(() => null)),
};

export const projectCreate = z.object({
  ...projectFields,
  deliverables: z.array(deliverable).max(100).default([]),
  // A monthly client's fixed deliverables, e.g. 5 videos, 5 thumbnails, "Social media management".
  targets: z.record(z.enum(TASK_KINDS), z.coerce.number().int().min(1).max(999)).optional(),
  services: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
});
export const projectUpdate = z.object(projectFields).partial();

export const projectCommentCreate = z.object({
  body: z.string().trim().min(1, 'Write a comment.').max(2000, 'Keep the comment under 2000 characters.'),
});

export const taskStatus = z.enum(['todo', 'in_progress', 'submitted', 'changes_requested', 'approved']);

export const taskCreate = z.object({
  ...taskFields,
  project_id: id,
  for_task_id: id.nullish(),
  // In a monthly project: the month it belongs to, and whether it is on top of the package.
  month_id: id.nullish(),
  is_extra: z.boolean().optional(),
  status: taskStatus.optional(),
  position: z.number().int().nonnegative().optional(),
});
export const taskUpdate = z
  .object({ ...taskFields, for_task_id: id.nullable(), is_extra: z.boolean(), status: taskStatus, position: z.number().int().nonnegative() })
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
  quantity: z.coerce.number().int('Use a whole number.').min(1, 'At least 1.').max(9999).optional(),
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
  // Set only by an admin: a personal message to that one person.
  recipient_id: z.string().uuid().nullish(),
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
  // Recorded in Cash Flow by itself each month, on this day, from this account.
  auto_record: z.boolean().optional(),
  record_day: z.coerce.number().int().min(1, 'Pick a day from 1 to 28.').max(28, 'Pick a day from 1 to 28.').optional(),
  account_id: z.string().uuid().nullable().optional().or(z.literal('').transform(() => null)),
});
export const fixedExpenseUpdate = fixedExpenseCreate.partial();

// --- Module 3: cash flow and invoices ---------------------------------------

export const accountCreate = z.object({
  name: text,
  kind: z.enum(['cash', 'bank', 'mobile_wallet']).optional(),
  opening_balance: z.number().finite().optional(),
});
export const accountUpdate = accountCreate.partial();

// Investors, and the money they put into the company.
export const investorCreate = z.object({
  name: text,
  phone: z.string().trim().max(40).nullish(),
  notes: z.string().trim().max(1000).nullish(),
});
export const investorUpdate = investorCreate.partial();
export const investmentCreate = z.object({
  investor_id: id,
  account_id: id,
  amount: z.coerce.number().positive('Use an amount above 0.').max(100000000000),
  received_on: date.optional(),
  note: z.string().trim().max(500).nullish(),
});
export const investmentUpdate = investmentCreate.partial();
// One form for both: the investor (found by name, or added) and the money they put in.
export const investorReceive = z.object({
  name: text,
  phone: z.string().trim().max(40).nullish(),
  amount: z.coerce.number().positive('Use an amount above 0.').max(100000000000),
  account_id: id,
  received_on: date.optional(),
  note: z.string().trim().max(500).nullish(),
});

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
  category: z.enum(['general', 'equipment', 'fixed', 'transport', 'investment', 'salary']).default('general'),
  description: text,
  // Paying an investor back: who it goes to.
  investor_id: id.nullish(),
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
  if (value.category === 'investment' && !value.investor_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose which investor is being paid back.', path: ['investor_id'] });
  }
  if (value.investor_id && value.category !== 'investment') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'An investor is only chosen for the Investment category.', path: ['investor_id'] });
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
  edit_permissions: z.array(z.enum(SEGMENT_KEYS)).max(SEGMENT_KEYS.length).optional(),
});
export const roleUpdate = z
  .object({
    name: text,
    description: optionalText,
    color: z.enum(ROLE_COLORS),
    permissions: z.array(z.enum(SEGMENT_KEYS)).max(SEGMENT_KEYS.length),
    edit_permissions: z.array(z.enum(SEGMENT_KEYS)).max(SEGMENT_KEYS.length),
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

// An admin changes how the app looks for everyone.
export const appearanceUpdate = z
  .object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Choose a colour.').transform((value) => value.toLowerCase()),
    corners: z.enum(Object.keys(CORNERS) as [keyof typeof CORNERS, ...(keyof typeof CORNERS)[]]),
    glow: z.boolean(),
  })
  .partial();

// An admin changes the company rules.
export const orgRulesUpdate = z
  .object({
    auto_approve_limit: z.coerce.number().min(0, 'Use 0 or more.').max(100000000),
    delete_log_days: z.coerce.number().int('Use whole days.').min(1, 'At least 1 day.').max(365, 'At most 365 days.'),
    // What invoices show: each part on or off, and a footer.
    invoice_options: z.record(z.union([z.boolean(), z.string().max(1000, 'Keep the footer under 1000 characters.')])),
    // Company details printed on invoices.
    name: z.string().trim().min(1, 'Give the company a name.').max(120),
    trade_license: z.string().trim().max(80).nullish(),
    contact_address: z.string().trim().max(300).nullish(),
    contact_phone: z.string().trim().max(40).nullish(),
    contact_email: z.string().trim().max(120).nullish(),
    website: z.string().trim().max(200).nullish(),
    // Reminders the daily job sends, and optional menu sections.
    reminders: z
      .object({
        due_tomorrow: z.coerce.boolean(),
        missed: z.coerce.boolean(),
        invoices: z.coerce.boolean(),
        equipment_late: z.coerce.boolean(),
        email: z.coerce.boolean(),
        shoot_days: z.coerce.number().int().min(0, '0 turns it off.').max(14, 'At most 14 days.'),
      })
      .partial(),
    hidden_sections: z.array(z.enum(OPTIONAL_SECTIONS)).max(10),
  })
  .partial();

// Someone asks for leave.
export const leaveCreate = z
  .object({
    start_date: date,
    end_date: date,
    reason: z.string().trim().min(1, 'Say what the leave is for.').max(500),
    kind: z.enum(['casual', 'sick', 'unpaid', 'other']).default('casual'),
  })
  .refine((value) => value.end_date >= value.start_date, { message: 'The last day cannot be before the first.', path: ['end_date'] });
export const leaveDecision = z.object({ status: z.enum(['approved', 'denied']) });
// Yearly casual and sick days everyone gets.
export const leaveAllowanceUpdate = z.object({
  casual: z.coerce.number().int().min(0).max(365),
  sick: z.coerce.number().int().min(0).max(365),
});
export const salaryAdvanceCreate = z.object({
  profile_id: z.string().uuid('Pick a person.'),
  amount: z.coerce.number().positive('Enter the amount given.').max(1e10),
  per_month: z.coerce.number().positive('Enter how much to take back each month.').max(1e10),
  given_on: date,
  account_id: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  note: z.string().trim().max(500).optional().or(z.literal('').transform(() => undefined)),
});

// Which kinds of notification a person wants.
export const notifyPrefs = z.object({
  assignments: z.boolean(),
  updates: z.boolean(),
  approvals: z.boolean(),
  money: z.boolean().optional(),
  leave: z.boolean().optional(),
  equipment: z.boolean().optional(),
});

export const clientFeedbackCreate = z.object({
  task_id: id,
  name: z.string().trim().min(1, 'Write your name.').max(80),
  decision: z.enum(['approved', 'changes']),
  comment: z.string().trim().max(2000).nullish(),
});

// The owner adds a company together with its first admin.
export const companyCreate = z.object({
  name: z.string().trim().min(2, 'Write the company name.').max(80),
  timezone: z.string().trim().min(3).max(60).default('Asia/Dhaka'),
  currency: z.string().trim().length(3).toUpperCase().default('BDT'),
  admin_name: z.string().trim().min(2, 'Write the admin\'s name.').max(80),
  admin_email: z.string().trim().toLowerCase().email('Write a valid email.'),
  admin_password: loginPassword,
  // From the setup steps: optional details, logo, and the features it starts without.
  trade_license: z.string().trim().max(80).nullish(),
  logo_data: z.string().startsWith('data:image/').max(400000, 'That logo is too large.').nullish(),
  hidden_sections: z.array(z.enum(OPTIONAL_SECTIONS)).max(10).optional(),
});

export const companyView = z.object({ org_id: id.nullable() });

// One line of a monthly project's package.
const packageFields = {
  title: text,
  description: optionalText,
  kind: z.enum(TASK_KINDS).optional(),
  assignee_id: id.nullish(),
  points_value: points.nullish(),
  due_day: dueDay.nullish(),
  for_item_id: id.nullish(),
  position: z.number().int().nonnegative().optional(),
};
export const packageItemCreate = z.object({ ...packageFields, project_id: id });
export const packageItemUpdate = z.object(packageFields).partial();

// Open a month of a monthly project: this month, next month, or a given YYYY-MM.
export const monthOpen = z.object({ month: z.union([z.literal('current'), z.literal('next'), z.string().regex(/^\d{4}-\d{2}$/)]).default('current') });
export const monthUpdate = z
  .object({ status: z.enum(['open', 'closed']), note: optionalText })
  .partial();

// Asking to take a piece of equipment, or (for people who manage equipment) recording it directly.
export const checkoutCreate = z
  .object({
    equipment_id: id,
    purpose: z.string().trim().max(300).nullish(),
    project_id: id.nullish(),
    start_date: date.nullish(),
    due_back: date.nullish(),
    // Only for admins: who takes it.
    holder_id: id.nullish(),
    take_now: z.boolean().optional(),
  })
  .refine((value) => !value.due_back || !value.start_date || value.due_back >= value.start_date, {
    message: 'The return date must be on or after the start date.',
    path: ['due_back'],
  });

export const checkoutAction = z.object({
  action: z.enum(['approve', 'decline', 'return', 'cancel']),
  note: z.string().trim().max(500).nullish(),
});


// A monthly client's fixed deliverable: a type with a number ("5 videos"), or a named service ("Social media management").
const fixedFields = {
  kind: z.enum(TASK_KINDS),
  quantity: z.coerce.number().int('Use a whole number.').min(1, 'At least 1.').max(999).nullish(),
  label: z.string().trim().max(80, 'Keep it under 80 characters.').nullish(),
  position: z.number().int().nonnegative().optional(),
};
export const fixedDeliverableCreate = z
  .object({ ...fixedFields, project_id: id })
  .refine((value) => value.quantity != null || Boolean(value.label), { message: 'Give a number, a name, or both.', path: ['quantity'] });
export const fixedDeliverableUpdate = z.object(fixedFields).partial();

// Several tasks at once: copies of one ("Video" ×5), or a month filled from its fixed deliverables.
export const taskBulkCreate = z.object({
  project_id: id,
  month_id: id.nullish(),
  from_fixed: z.boolean().optional(),
  kind: z.enum(TASK_KINDS).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  count: z.coerce.number().int().min(1, 'At least 1.').max(30, 'At most 30 at a time.').default(1),
  assignee_id: id.nullish(),
  due_date: date.nullish(),
  description: z.string().trim().max(2000).nullish(),
  points_value: z.coerce.number().int().nonnegative().nullish(),
});

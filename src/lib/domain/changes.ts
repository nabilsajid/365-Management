// Which API paths a change request may target. Approving a request replays the
// stored request as the admin, so the path is checked against this list both
// when it is stored and again before it is replayed.

const RESOURCES = [
  'accounts',
  'attendance',
  'bonuses',
  'clients',
  'equipment',
  'expenses',
  'fixed-expenses',
  'invoices',
  'payments',
  'points',
  'projects',
  'tasks',
  'violation-types',
];

const ID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PATTERN = new RegExp(`^/api/(${RESOURCES.join('|')})(/${ID})?$`, 'i');

export function isReplayablePath(path: string): boolean {
  return PATTERN.test(path);
}

const SECTION: Record<string, string> = {
  accounts: 'Cash flow',
  invoices: 'Cash flow',
  payments: 'Cash flow',
  expenses: 'Expenses',
  clients: 'Clients',
  'fixed-expenses': 'Fixed costs',
  equipment: 'Equipment',
  attendance: 'Attendance',
  points: 'Points',
  'violation-types': 'Points',
  bonuses: 'Bonuses',
  projects: 'Projects',
  tasks: 'Projects',
};

/** The part of the app a change request belongs to, for display. */
export function sectionOf(path: string): string {
  return SECTION[path.split('/')[2] ?? ''] ?? 'Other';
}

// --- Showing a change request as a tidy list of fields ---------------------------

const THING: Record<string, string> = {
  accounts: 'account',
  attendance: 'attendance day',
  bonuses: 'bonus',
  clients: 'client',
  equipment: 'equipment',
  expenses: 'expense',
  'fixed-expenses': 'fixed expense',
  invoices: 'invoice',
  payments: 'payment',
  points: 'points entry',
  projects: 'project',
  tasks: 'deliverable',
  'violation-types': 'violation type',
};

const ACTION: Record<string, string> = { POST: 'Add', PATCH: 'Change', DELETE: 'Delete' };

/** Friendlier names for stored field names. Anything not listed is shown with its underscores removed. */
const FIELD_LABEL: Record<string, string> = {
  description: 'Description',
  amount: 'Amount',
  expense_date: 'Date',
  trip_origin: 'From',
  trip_destination: 'To',
  traveler_id: 'Traveller',
  project_id: 'Project',
  client_id: 'Client',
  purpose: 'Purpose',
  account_id: 'Paid from',
  fixed_expense_id: 'Fixed cost',
  assignee_id: 'Assignee',
  kind: 'Type',
  for_task_id: 'Thumbnail for',
  shoot_status: 'Shoot',
  shoot_date: 'Shoot date',
  employee_id: 'Employee',
  current_holder_id: 'Held by',
  member_ids: 'Team',
  violation_type_id: 'Violation type',
  file_links: 'Links',
  work_date: 'Date',
  check_in: 'Entry',
  check_out: 'Exit',
  monthly_amount: 'Monthly amount',
  purchase_price: 'Purchase price',
  points_value: 'Points',
  due_date: 'Due',
  start_date: 'Start',
  paid_on: 'Paid on',
  is_active: 'Active',
};

const MONEY_KEYS = new Set(['amount', 'monthly_amount', 'purchase_price', 'total', 'opening_balance']);
const WORD_KEYS = new Set(['category', 'status', 'kind', 'condition', 'source', 'method', 'review_status', 'shoot_status']);
const HIDDEN_KEYS = new Set(['id', 'org_id', 'position', 'created_by']);

const words = (value: string) => {
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};
const taka = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? `৳${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : String(value);
};

export interface ChangeDetails {
  /** "Add expense", "Change project", "Delete client". */
  heading: string;
  /** The record's own name, when there is one: "meeting". */
  name: string | null;
  /** One line per field the change touches, in the order it was entered. */
  fields: { label: string; value: string }[];
}

/**
 * Breaks a stored change request into a heading and labelled fields.
 * `nameOf` turns an id (a person, project, client, account…) into its name;
 * ids it does not know are left out rather than shown as codes.
 */
export function changeDetails(
  change: { method: string; path: string; body: Record<string, unknown> | null; summary: string },
  nameOf: (id: string) => string | undefined,
): ChangeDetails {
  const resource = change.path.split('/')[2] ?? '';
  const heading = `${ACTION[change.method] ?? 'Change'} ${THING[resource] ?? 'record'}`;
  // The summary quotes the record's name: Add expense "meeting" (…).
  const name = /"([^"]+)"/.exec(change.summary)?.[1] ?? null;
  const clearing = change.method === 'PATCH';

  const fields: ChangeDetails['fields'] = [];
  for (const [key, value] of Object.entries(change.body ?? {})) {
    if (HIDDEN_KEYS.has(key) || value === undefined) continue;
    const label = FIELD_LABEL[key] ?? words(key.replace(/_ids?$/, ''));
    let text: string | null = null;

    if (value === null || value === '') {
      // An edit that empties a field is worth showing; an empty field on a new record is not.
      text = clearing ? 'Cleared' : null;
    } else if (Array.isArray(value)) {
      if (value.length === 0) text = clearing ? 'None' : null;
      else if (key.endsWith('_ids')) text = value.map((id) => nameOf(String(id))).filter(Boolean).join(', ') || `${value.length} selected`;
      else if (key === 'file_links') text = value.map((link) => String((link as { label?: unknown })?.label ?? 'Link')).join(', ');
      else text = `${value.length} ${value.length === 1 ? 'item' : 'items'}`;
    } else if (typeof value === 'boolean') {
      text = value ? 'Yes' : 'No';
    } else if (typeof value === 'object') {
      text = null;
    } else if (key.endsWith('_id')) {
      text = nameOf(String(value)) ?? null;
    } else if (MONEY_KEYS.has(key)) {
      text = taka(value);
    } else if (WORD_KEYS.has(key)) {
      text = words(String(value));
    } else {
      text = String(value);
    }

    if (text !== null && text !== '') fields.push({ label, value: text });
  }
  return { heading, name, fields };
}

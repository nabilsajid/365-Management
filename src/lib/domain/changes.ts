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

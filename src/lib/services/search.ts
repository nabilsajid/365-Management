import type { SupabaseClient } from '@supabase/supabase-js';

export type SearchKind =
  | 'page'
  | 'project'
  | 'task'
  | 'person'
  | 'client'
  | 'invoice'
  | 'expense'
  | 'equipment'
  | 'need'
  | 'notice'
  | 'message'
  | 'comment'
  | 'leave'
  | 'investor'
  | 'other';

export interface SearchItem {
  href: string;
  title: string;
  detail?: string | null;
}
export interface SearchGroup {
  kind: SearchKind;
  title: string;
  items: SearchItem[];
}
export interface SearchViewer {
  isAdmin: boolean;
  segments: ReadonlySet<string>;
}

/** The words typed, cleaned of characters that would break a database filter. Every word must match. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[%_\\"'(),:;*]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .slice(0, 5);
}

/** A PostgREST "or" filter: the word in any of the columns. Quoted, so dots and other marks are safe. */
export function anyColumn(columns: string[], word: string): string {
  return columns.map((column) => `${column}.ilike."%${word}%"`).join(',');
}

/** Places in the app, found by name or by what they hold. `need` is a section, or 'admin'. */
export const PAGES: { title: string; href: string; words: string; need?: string }[] = [
  { title: 'Dashboard', href: '/dashboard', words: 'home overview today' },
  { title: 'Updates · Announcements', href: '/updates', words: 'notice board news announcement team guide help' },
  { title: 'Updates · Broadcasts', href: '/updates?tab=broadcasts', words: 'broadcast urgent message admin' },
  { title: 'Updates · Messages', href: '/updates?tab=messages', words: 'personal message inbox' },
  { title: 'Team guide', href: '/updates#guide', words: 'guide tutorial help how to start new joiner' },
  { title: 'Projects', href: '/projects', words: 'project board client work' },
  { title: 'My Tasks', href: '/my-tasks', words: 'task deliverable assigned work todo' },
  { title: 'Calendar', href: '/calendar', words: 'calendar date due shoot schedule month' },
  { title: 'Cash Flow & Invoices', href: '/cashflow', words: 'cash flow money finance balance income', need: 'cashflow' },
  { title: 'Invoices', href: '/cashflow?tab=income', words: 'invoice payment due client bill', need: 'cashflow' },
  { title: 'Expenses', href: '/cashflow?tab=expenses', words: 'expense cost spend', need: 'cashflow' },
  { title: 'Investments', href: '/cashflow?tab=investments', words: 'investment investor invest due owe repay loan capital', need: 'cashflow' },
  { title: 'Accounts & clients', href: '/cashflow?tab=accounts', words: 'account bank cash bkash balance client customer', need: 'cashflow' },
  { title: 'Equipment', href: '/logistics', words: 'equipment logistics inventory camera lens gear' },
  { title: 'Equipment checkouts', href: '/logistics?tab=checkouts', words: 'checkout take borrow return equipment logistics who has track request' },
  { title: 'Needed items', href: '/logistics?tab=needs', words: 'needed items buy request equipment logistics' },
  { title: 'Fixed costs', href: '/logistics?tab=fixed', words: 'fixed costs rent utilities monthly', need: 'costs' },
  { title: 'Travel costs', href: '/logistics?tab=travel', words: 'travel transport trip cost', need: 'costs' },
  { title: 'Employees & Rewards · Points', href: '/employees', words: 'points reward score statement target' },
  { title: 'Attendance', href: '/employees?tab=attendance', words: 'attendance entry exit check in office day' },
  { title: 'Bonuses', href: '/employees?tab=bonuses', words: 'bonus reward money' },
  { title: 'Point rules & violations', href: '/employees?tab=settings', words: 'rules violation deduction late target', need: 'team_points' },
  { title: 'Team contacts', href: '/profile?tab=team', words: 'profile contact phone team people number address' },
  { title: 'Employees · Team', href: '/employees?tab=team', words: 'employee staff team member add person', need: 'admin' },
  { title: 'My profile & notifications', href: '/profile', words: 'my profile notification alert device password' },
  { title: 'Leave', href: '/leave', words: 'leave holiday vacation sick off' },
  { title: 'My Requests', href: '/requests', words: 'request pending approval status' },
  { title: 'Search', href: '/search', words: 'search find' },
  { title: 'Approvals', href: '/approvals', words: 'approve approval pending request verify', need: 'admin' },
  { title: 'Roles & Access', href: '/roles', words: 'role access permission tag view as', need: 'admin' },
  { title: 'Settings · Rules', href: '/settings?tab=rules', words: 'settings rules approval limit', need: 'admin' },
  { title: 'Approvals · Emails', href: '/approvals?tab=emails', words: 'email mail approve send salary alerts outbox', need: 'admin' },
  { title: 'Settings · Invoice', href: '/settings?tab=invoice', words: 'invoice design logo signature payment bank details thank you pdf', need: 'admin' },
  { title: 'Settings · Company', href: '/settings?tab=company', words: 'company details address phone email website invoice menu sections hide', need: 'admin' },
  { title: 'Settings · Reminders', href: '/settings?tab=reminders', words: 'reminders alerts notifications deadline shoot invoice overdue', need: 'admin' },
  { title: 'Settings · Appearance', href: '/settings?tab=appearance', words: 'appearance colour color theme look', need: 'admin' },
  { title: 'Settings · Delete log', href: '/settings?tab=delete-log', words: 'delete log deleted removed history', need: 'admin' },
  { title: 'Settings · System check', href: '/settings?tab=system', words: 'system check database update', need: 'admin' },
  { title: 'Activity history', href: '/settings?tab=activity', words: 'activity history audit who changed log', need: 'admin' },
  { title: 'Backups and full export', href: '/settings?tab=backups', words: 'backup export download everything excel restore', need: 'admin' },
  { title: 'Two-step sign-in', href: '/settings?tab=security', words: 'two step 2fa mfa security authenticator code', need: 'admin' },
  { title: 'KPIs', href: '/kpi', words: 'kpi performance on time first time approval delivered revenue points dashboard', need: 'admin' },
  { title: 'Monthly summary', href: '/report', words: 'report summary monthly print pdf export', need: 'admin' },
];

/** Pages and sections this person can open whose name or contents match every word. */
export function matchPages(words: string[], viewer: SearchViewer): SearchItem[] {
  if (words.length === 0) return [];
  return PAGES.filter((page) => {
    if (page.need === 'admin' && !viewer.isAdmin) return false;
    if (page.need && page.need !== 'admin' && !viewer.isAdmin && !viewer.segments.has(page.need)) return false;
    const text = `${page.title} ${page.words}`.toLowerCase();
    return words.every((word) => text.includes(word));
  }).map((page) => ({ href: page.href, title: page.title }));
}

type Row = Record<string, unknown>;
const text = (value: unknown) => (typeof value === 'string' ? value : value == null ? '' : String(value));
const snippet = (value: unknown, words: string[]) => {
  const full = text(value).replace(/\s+/g, ' ').trim();
  if (full.length <= 90) return full;
  const at = Math.max(0, full.toLowerCase().indexOf(words[0] ?? ''));
  const start = Math.max(0, at - 30);
  return `${start > 0 ? '…' : ''}${full.slice(start, start + 90)}…`;
};
const money = (value: unknown) => (value == null ? '' : `৳${Number(value).toLocaleString('en-US')}`);

/**
 * Everything in the app matching every word typed: pages, projects, tasks,
 * people, clients, invoices, costs, equipment, needed items, announcements,
 * messages, comments and leave. Row level security means each person only
 * finds what they are allowed to see; a part they cannot see simply has no results.
 */
export async function runSearch(
  supabase: SupabaseClient,
  orgId: string,
  raw: string,
  viewer: SearchViewer,
  perGroup = 10,
): Promise<SearchGroup[]> {
  const words = searchWords(raw.slice(0, 80));
  if (words.length === 0 || words.join('').length < 2) return [];

  // One query per kind; each word must appear in at least one of its columns.
  const find = (table: string, select: string, columns: string[], order = 'created_at') => {
    let query = supabase.from(table).select(select).eq('org_id', orgId);
    for (const word of words) query = query.or(anyColumn(columns, word));
    return query.order(order, { ascending: false }).limit(perGroup);
  };
  const results = await Promise.all([
    find('projects', 'id, name, status, brief', ['name', 'brief']),
    find('tasks', 'id, title, status, description, project_id', ['title', 'description']),
    find('profiles', 'id, full_name, nickname, job_title, contact', ['full_name', 'nickname', 'job_title', 'contact']),
    find('clients', 'id, name, contact_name, email, phone', ['name', 'contact_name', 'email', 'phone']),
    find('invoices', 'id, invoice_number, amount, status, notes', ['invoice_number', 'notes']),
    find('expenses', 'id, description, amount, expense_date, category, purpose, trip_origin, trip_destination', ['description', 'purpose', 'trip_origin', 'trip_destination']),
    find('equipment', 'id, name, category, serial_number, condition', ['name', 'category', 'serial_number']),
    find('equipment_needs', 'id, item_name, note, status', ['item_name', 'note']),
    find('notices', 'id, title, body', ['title', 'body']),
    find('broadcasts', 'id, message, recipient_id', ['message']),
    find('project_comments', 'id, body, project_id', ['body']),
    find('task_comments', 'id, body, task_id', ['body']),
    find('leave_requests', 'id, reason, start_date, end_date, status', ['reason']),
    find('investors', 'id, name, phone', ['name', 'phone']),
  ]);
  const rows = (index: number) => (results[index].error ? [] : ((results[index].data ?? []) as unknown as Row[]));
  const canSeeMoney = viewer.isAdmin || viewer.segments.has('cashflow');

  const groups: SearchGroup[] = [
    { kind: 'page', title: 'Pages', items: matchPages(words, viewer) },
    { kind: 'project', title: 'Projects', items: rows(0).map((row) => ({ href: `/projects/${row.id}`, title: text(row.name), detail: text(row.status) })) },
    { kind: 'task', title: 'Tasks', items: rows(1).map((row) => ({ href: `/tasks/${row.id}`, title: text(row.title), detail: text(row.status).replace(/_/g, ' ') })) },
    {
      kind: 'person',
      title: 'People',
      items: rows(2).map((row) => ({ href: '/profile?tab=team', title: text(row.full_name), detail: [row.job_title, row.contact].filter(Boolean).map(text).join(' · ') })),
    },
    {
      kind: 'client',
      title: 'Clients',
      items: rows(3).map((row) => ({
        href: canSeeMoney ? '/cashflow?tab=accounts' : '/projects',
        title: text(row.name),
        detail: [row.contact_name, row.phone, row.email].filter(Boolean).map(text).join(' · '),
      })),
    },
    {
      kind: 'invoice',
      title: 'Invoices',
      items: rows(4).map((row) => ({ href: `/invoices/${row.id}`, title: `Invoice ${text(row.invoice_number)}`, detail: [money(row.amount), text(row.status)].filter(Boolean).join(' · ') })),
    },
    {
      kind: 'expense',
      title: 'Costs',
      items: rows(5).map((row) => ({
        href: canSeeMoney ? `/cashflow?tab=expenses&month=${text(row.expense_date).slice(0, 7)}` : '/logistics',
        title: row.trip_origin ? `${text(row.trip_origin)} → ${text(row.trip_destination)}` : text(row.description),
        detail: [money(row.amount), text(row.expense_date), text(row.purpose || row.category)].filter(Boolean).join(' · '),
      })),
    },
    {
      kind: 'equipment',
      title: 'Equipment',
      items: rows(6).map((row) => ({ href: '/logistics?tab=equipment', title: text(row.name), detail: [row.category, row.serial_number, row.condition].filter(Boolean).map(text).join(' · ') })),
    },
    { kind: 'need', title: 'Needed items', items: rows(7).map((row) => ({ href: '/logistics?tab=needs', title: text(row.item_name), detail: text(row.status) })) },
    { kind: 'notice', title: 'Announcements', items: rows(8).map((row) => ({ href: '/updates', title: text(row.title), detail: snippet(row.body, words) })) },
    {
      kind: 'message',
      title: 'Broadcasts & messages',
      items: rows(9).map((row) => ({ href: row.recipient_id ? '/updates?tab=messages' : '/updates?tab=broadcasts', title: snippet(row.message, words) })),
    },
    {
      kind: 'comment',
      title: 'Comments',
      items: [
        ...rows(10).map((row) => ({ href: `/projects/${row.project_id}`, title: snippet(row.body, words), detail: 'On a project' })),
        ...rows(11).map((row) => ({ href: `/tasks/${row.task_id}`, title: snippet(row.body, words), detail: 'On a task' })),
      ].slice(0, perGroup),
    },
    {
      kind: 'leave',
      title: 'Leave',
      items: rows(12).map((row) => ({ href: '/leave', title: snippet(row.reason, words), detail: `${text(row.start_date)} to ${text(row.end_date)} · ${text(row.status)}` })),
    },
    {
      kind: 'investor',
      title: 'Investors',
      items: rows(13).map((row) => ({ href: '/cashflow?tab=investments', title: text(row.name), detail: text(row.phone) || 'Investor' })),
    },
  ];
  return groups.filter((group) => group.items.length > 0);
}

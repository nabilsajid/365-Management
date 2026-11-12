// Roles are tags an admin creates and gives to people; a person can hold
// several. Each role lists the segments its holders can see. What someone can
// see is the union across their roles. A role flagged is_admin sees and edits
// everything. Mirrors supabase/migrations/20261112000006_roles.sql.

export const SEGMENTS = [
  { key: 'projects', label: 'All projects', description: 'Every project, its tasks and submissions (people always see projects they are assigned to)' },
  { key: 'equipment', label: 'Equipment', description: 'The whole equipment inventory and who holds it' },
  { key: 'costs', label: 'Fixed & transport costs', description: 'Fixed monthly expenses and transport trips' },
  { key: 'cashflow', label: 'Cash flow', description: 'Accounts, invoices, payments and all expenses' },
  { key: 'team_points', label: 'Team points', description: "Everyone's attendance, points and deductions" },
  { key: 'bonuses', label: 'Team bonuses', description: "Everyone's bonuses" },
] as const;

export type Segment = (typeof SEGMENTS)[number]['key'];

export const SEGMENT_KEYS = SEGMENTS.map((segment) => segment.key) as [Segment, ...Segment[]];

export function segmentLabel(key: string): string {
  return SEGMENTS.find((segment) => segment.key === key)?.label ?? key;
}

/** Every segment the given roles open up, with duplicates removed. */
export function segmentsFromRoles(roles: { permissions: string[] | null }[]): Set<string> {
  const segments = new Set<string>();
  for (const role of roles) for (const key of role.permissions ?? []) segments.add(key);
  return segments;
}

/** Admins see everything; everyone else needs a role that includes the segment. */
export function canSee(viewer: { isAdmin: boolean; segments: ReadonlySet<string> }, segment: Segment): boolean {
  return viewer.isAdmin || viewer.segments.has(segment);
}

/** Label colours a role can have. Mirrors the check constraint on roles.color. */
export const ROLE_COLORS = ['red', 'orange', 'amber', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'slate'] as const;
export type RoleColor = (typeof ROLE_COLORS)[number];

export interface Tag {
  label: string;
  color?: string;
}

/** Coloured tags for a list of role names, in alphabetical order. */
export function roleTags(names: (string | null | undefined)[], colorByName: ReadonlyMap<string, string>): Tag[] {
  return names
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ label: name, color: colorByName.get(name) }));
}

/** Coloured tags from a person's job title, which is their role names joined by commas. */
export function titleTags(jobTitle: string | null | undefined, colorByName: ReadonlyMap<string, string>): Tag[] {
  return roleTags((jobTitle ?? '').split(',').map((part) => part.trim()), colorByName);
}

import {
  ClipboardCheck,
  ContactRound,
  Pin,
  Inbox,
  Megaphone,
  ShieldCheck,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Package,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown to admins only. */
  adminOnly?: boolean;
  /** Shown to everyone except admins. */
  nonAdminOnly?: boolean;
  /** Shown to admins and to anyone whose roles include this segment. */
  segment?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export interface Viewer {
  isAdmin: boolean;
  segments: ReadonlySet<string>;
}

// Only pages that exist are listed. Items without a rule are for everyone:
// those pages show each person their own data, plus whatever their roles add.
const GROUPS: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/notices', label: 'Notice Board', icon: Pin },
      { href: '/broadcasts', label: 'Broadcasts', icon: Megaphone },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban, segment: 'projects' },
      { href: '/my-tasks', label: 'My Tasks', icon: ListChecks },
    ],
  },
  { title: 'Finance', items: [{ href: '/cashflow', label: 'Cash Flow & Invoices', icon: Wallet, segment: 'cashflow' }] },
  { title: 'Logistics', items: [{ href: '/logistics', label: 'Equipment & Costs', icon: Package }] },
  {
    title: 'Team',
    items: [
      { href: '/employees', label: 'Employees & Rewards', icon: Users },
      { href: '/profile', label: 'Profiles & Contacts', icon: ContactRound },
    ],
  },
  {
    title: 'Management',
    items: [
      { href: '/approvals', label: 'Approvals', icon: ClipboardCheck, adminOnly: true },
      { href: '/requests', label: 'My Requests', icon: Inbox, nonAdminOnly: true },
      { href: '/roles', label: 'Roles & Access', icon: ShieldCheck, adminOnly: true },
    ],
  },
];

export function navFor(viewer: Viewer): NavGroup[] {
  const allowed = (item: NavItem) =>
    viewer.isAdmin
      ? !item.nonAdminOnly
      : !item.adminOnly && (!item.segment || viewer.segments.has(item.segment));
  return GROUPS.map((group) => ({ ...group, items: group.items.filter(allowed) })).filter(
    (group) => group.items.length > 0,
  );
}

/** Where a path sits in the navigation, for the top bar. Task pages belong to My Tasks or Projects. */
export function locate(pathname: string, viewer?: Viewer): { group: string; label: string; href: string } | null {
  const canSeeProjects = !viewer || viewer.isAdmin || viewer.segments.has('projects');
  let path = pathname;
  if (pathname.startsWith('/tasks') || (pathname.startsWith('/projects/') && !canSeeProjects)) {
    path = canSeeProjects ? '/projects' : '/my-tasks';
  }
  for (const group of GROUPS) {
    for (const item of group.items) {
      if (path === item.href || path.startsWith(`${item.href}/`)) {
        return { group: group.title, label: item.label, href: item.href };
      }
    }
  }
  return null;
}

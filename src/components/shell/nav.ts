import {
  ClipboardCheck,
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
  adminOnly?: boolean;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

// Only pages that exist are listed. Finance, the dashboard and approvals are
// admin-only, matching the permissions enforced by the API and the database.
const GROUPS: NavGroup[] = [
  { title: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: true }] },
  {
    title: 'Workspace',
    items: [
      { href: '/projects', label: 'Projects & Clients', icon: FolderKanban },
      { href: '/my-tasks', label: 'My Tasks', icon: ListChecks },
    ],
  },
  { title: 'Finance', items: [{ href: '/cashflow', label: 'Cash Flow & Invoices', icon: Wallet, adminOnly: true }] },
  { title: 'Logistics', items: [{ href: '/logistics', label: 'Equipment & Costs', icon: Package }] },
  { title: 'Team', items: [{ href: '/employees', label: 'Employees & Rewards', icon: Users }] },
  { title: 'Management', items: [{ href: '/approvals', label: 'Approvals', icon: ClipboardCheck, adminOnly: true }] },
];

export function navFor(isAdmin: boolean): NavGroup[] {
  return GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isAdmin || !item.adminOnly),
  })).filter((group) => group.items.length > 0);
}

/** Where a path sits in the navigation, for the top bar. Task pages belong to Projects. */
export function locate(pathname: string): { group: string; label: string; href: string } | null {
  const path = pathname.startsWith('/tasks') ? '/projects' : pathname;
  for (const group of GROUPS) {
    for (const item of group.items) {
      if (path === item.href || path.startsWith(`${item.href}/`)) {
        return { group: group.title, label: item.label, href: item.href };
      }
    }
  }
  return null;
}

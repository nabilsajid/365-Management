import {
  Activity,
  AlertCircle,
  Banknote,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  FileUp,
  FolderKanban,
  Home,
  ListChecks,
  Megaphone,
  Package,
  ShoppingCart,
  Receipt,
  Target,
  UserCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { CashflowChart } from '@/components/dashboard/cashflow-chart';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { money, monthLabel } from '@/lib/format';
import { getPageContext } from '@/lib/page';
import { getDashboard } from '@/lib/services/dashboard';
import { getOrgTimezone } from '@/lib/services/rewards';

interface KpiProps {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  href: string;
}

function Kpi({ icon: Icon, label, value, note, href }: KpiProps) {
  return (
    <Link
      href={href}
      className="group block rounded-card border border-line bg-card p-5 text-ink no-underline transition-[border-color,transform] duration-100 hover:border-line-strong hover:no-underline active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-muted">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-control bg-primary-soft text-primary">
          <Icon size={16} aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
      <p className="mt-1 text-[13px] text-muted">{note}</p>
    </Link>
  );
}

function shortDate(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const ACTIVITY_ICON: Record<string, LucideIcon> = { submission: FileUp, payment: Banknote, expense: Receipt };

// One dashboard, different for every role: each card and section appears only
// when the viewer's roles include its segment. Everyone gets their own tasks,
// points and deadlines.
export default async function DashboardPage() {
  const { supabase, orgId, isAdmin, userId, profile, can, localDate } = await getPageContext();

  const data = await getDashboard(supabase, orgId, await getOrgTimezone(supabase, orgId), userId);
  const waiting = data.approvals.changes + data.approvals.submissions + data.approvals.attendance + data.approvals.bonuses;
  const hasCashflow = data.cashflow.some((point) => point.income > 0 || point.expenses > 0);
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const toTarget = Math.max(0, data.mine.target - data.mine.points);

  const kpis: KpiProps[] = [];
  if (can('projects')) {
    kpis.push(
      { icon: FolderKanban, label: 'Active projects', value: String(data.activeProjects), note: `${data.projects.completed ?? 0} completed so far`, href: '/projects' },
      { icon: ListChecks, label: 'Pending tasks', value: String(data.pendingTasks), note: `${data.tasks.submitted ?? 0} waiting for review`, href: isAdmin ? '/approvals' : '/projects' },
    );
  }
  if (can('cashflow')) {
    kpis.push(
      { icon: Wallet, label: 'Available funds', value: money(data.funds), note: `${money(data.expensesThisMonth)} spent this month`, href: '/cashflow' },
      { icon: Receipt, label: 'Client dues', value: money(data.outstanding), note: 'Outstanding on open invoices', href: '/cashflow' },
    );
  }
  if (can('equipment')) {
    kpis.push({
      icon: Package,
      label: 'Equipment value',
      value: money(data.equipment.value),
      note: `${plural(data.equipment.count, 'item')}${data.equipment.unpriced > 0 ? `, ${data.equipment.unpriced} without a price` : ''}`,
      href: '/logistics',
    });
  }
  if (can('equipment')) {
    kpis.push({ icon: ShoppingCart, label: 'Urgently needed', value: String(data.neededItems), note: 'Items the studio needs to get', href: '/logistics' });
  }
  if (can('costs')) {
    kpis.push({ icon: Home, label: 'Fixed monthly costs', value: money(data.fixedMonthly), note: 'Rent, utilities and other recurring costs', href: '/logistics' });
  }
  kpis.push(
    { icon: UserCheck, label: 'My open tasks', value: String(data.mine.openTasks), note: 'Deliverables assigned to you', href: '/my-tasks' },
    {
      icon: Target,
      label: 'My points this month',
      value: data.mine.points.toLocaleString('en-US'),
      note: toTarget === 0 ? `Target of ${data.mine.target.toLocaleString('en-US')} reached` : `${toTarget.toLocaleString('en-US')} to reach ${data.mine.target.toLocaleString('en-US')}`,
      href: '/employees',
    },
  );
  if (!can('equipment')) {
    kpis.push({ icon: Package, label: 'Equipment I hold', value: String(data.mine.equipmentHeld), note: 'Items recorded as held by you', href: '/logistics' });
  }

  const approvals = [
    { label: 'Change requests to decide', count: data.approvals.changes },
    { label: 'Task submissions to review', count: data.approvals.submissions },
    { label: 'Attendance days to verify', count: data.approvals.attendance },
    { label: 'Bonuses to approve', count: data.approvals.bonuses },
  ];
  const showActivity = can('projects') || can('cashflow') || data.activity.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1>Welcome, {profile.full_name}</h1>
        <p className="mt-0.5 text-muted">
          {profile.job_title ?? 'No role yet'} · {monthLabel(data.month)}
        </p>
      </div>

      {data.broadcasts.length > 0 ? (
        <Card className="border-warning">
          <CardHeader
            title={isAdmin ? 'Urgent broadcasts' : 'Your open broadcasts'}
            description={isAdmin ? 'Messages from the team that need your attention.' : 'Sent to the admins and not resolved yet.'}
            action={<Link href="/broadcasts">{isAdmin ? 'Open inbox' : 'View'}</Link>}
          />
          <CardContent>
            <ul className="divide-y divide-line">
              {data.broadcasts.map((item) => (
                <li key={item.id} className="flex gap-3 py-2.5 first:pt-0 last:pb-0">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-strong">
                    <Megaphone size={14} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-ink">{item.message}</p>
                    <p className="text-xs text-muted">
                      {isAdmin ? `${item.sender} · ` : ''}
                      {shortDate(localDate(item.at))}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi) => (
          <Kpi key={kpi.label} {...kpi} />
        ))}
      </div>

      {can('cashflow') || isAdmin ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {can('cashflow') ? (
            <Card className={isAdmin ? 'xl:col-span-2' : 'xl:col-span-3'}>
              <CardHeader title="Cash flow" description="Payments received and expenses paid, last 6 months." />
              <CardContent>
                {hasCashflow ? (
                  <CashflowChart data={data.cashflow} />
                ) : (
                  <EmptyState icon={BarChart3} title="No cash flow yet">
                    Record a payment or an expense and it will show up here.
                  </EmptyState>
                )}
              </CardContent>
            </Card>
          ) : null}

          {isAdmin ? (
            <Card className={can('cashflow') ? undefined : 'xl:col-span-3'}>
              <CardHeader
                title="Pending approvals"
                description={waiting === 0 ? 'Nothing is waiting for you.' : `${plural(waiting, 'item')} waiting for you.`}
                action={<Link href="/approvals">Review</Link>}
              />
              <CardContent>
                {waiting === 0 ? (
                  <EmptyState icon={CheckCircle2} title="All caught up" />
                ) : (
                  <ul className="divide-y divide-line">
                    {approvals.map((row) => (
                      <li key={row.label} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                        <span className="text-[13px] text-ink">{row.label}</span>
                        <Badge tone={row.count > 0 ? 'warning' : 'neutral'}>{row.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {can('projects') ? (
          <Card>
            <CardHeader title="Project progress" description="Approved deliverables per running project." action={<Link href="/projects">All projects</Link>} />
            <CardContent>
              {data.progress.length === 0 ? (
                <EmptyState icon={FolderKanban} title="No running projects">
                  Onboard a project to track its deliverables here.
                </EmptyState>
              ) : (
                <ul className="space-y-4">
                  {data.progress.map((project) => (
                    <li key={project.id}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <Link href={`/projects/${project.id}`} className="truncate text-[13px] font-medium text-ink hover:text-primary">
                          {project.name}
                        </Link>
                        <span className="shrink-0 text-xs tabular-nums text-muted">
                          {project.total === 0 ? 'No tasks' : `${project.approved} of ${project.total}`}
                        </span>
                      </div>
                      <Progress value={project.percent} label={`${project.name} progress`} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader
            title={can('projects') ? 'Upcoming deadlines' : 'My deadlines'}
            description={can('projects') ? 'Unfinished tasks and projects with a due date.' : 'Your unfinished tasks with a due date.'}
          />
          <CardContent>
            {data.deadlines.length === 0 ? (
              <EmptyState icon={CalendarClock} title="No deadlines set">
                Tasks with a due date will show up here.
              </EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {data.deadlines.map((item) => (
                  <li key={`${item.kind}-${item.id}`} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                    <div className="min-w-0">
                      <Link
                        href={item.kind === 'task' ? `/tasks/${item.id}` : `/projects/${item.id}`}
                        className="block truncate text-[13px] font-medium text-ink hover:text-primary"
                      >
                        {item.title}
                      </Link>
                      <span className="block truncate text-xs text-muted">{item.context ?? 'Project'}</span>
                    </div>
                    {item.overdue ? (
                      <Badge tone="danger">
                        <AlertCircle size={12} aria-hidden className="mr-1" />
                        Overdue · {shortDate(item.due_date)}
                      </Badge>
                    ) : (
                      <Badge>{shortDate(item.due_date)}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {showActivity ? (
          <Card>
            <CardHeader title="Recent activity" description="The latest of what your role can see." />
            <CardContent>
              {data.activity.length === 0 ? (
                <EmptyState icon={Activity} title="No activity yet" />
              ) : (
                <ul className="space-y-3.5">
                  {data.activity.map((item) => {
                    const Icon = ACTIVITY_ICON[item.kind] ?? Activity;
                    return (
                      <li key={`${item.kind}-${item.id}`} className="flex gap-3">
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-subtle text-muted">
                          <Icon size={14} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <Link
                            href={item.href === '/cashflow' && !can('cashflow') ? '/logistics' : item.href}
                            className="block truncate text-[13px] font-medium text-ink hover:text-primary"
                          >
                            {item.title}
                          </Link>
                          <span className="block text-xs text-muted">
                            {[item.detail, item.amount === null ? null : money(item.amount), shortDate(localDate(item.at))]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

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
  UserCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { CashflowChart } from '@/components/dashboard/cashflow-chart';
import { CountUp } from '@/components/dashboard/count-up';
import { PointsTile } from '@/components/dashboard/points-tile';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Progress } from '@/components/ui/progress';
import { money, monthLabel } from '@/lib/format';
import { getPageContext } from '@/lib/page';
import { getDashboard } from '@/lib/services/dashboard';
import { getOrgTimezone } from '@/lib/services/rewards';
import { cn } from '@/lib/utils';

interface TileProps {
  icon: LucideIcon;
  label: string;
  /** A number counts up when it appears; pass text for anything else. */
  value: number | string;
  kind?: 'number' | 'money';
  note: string;
  href: string;
  /** 'wide' spans two columns. */
  size?: 'wide';
  tone?: 'green';
  children?: ReactNode;
}

function Tile({ icon: Icon, label, value, kind = 'number', note, href, size, tone, children, index }: TileProps & { index: number }) {
  return (
    <Link
      href={href}
      className={cn('tile', size === 'wide' && 'tile-wide', tone && `tone-${tone}`)}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="flex items-center justify-between">
        <p className="tile-label">{label}</p>
        <span className="tile-icon">
          <Icon size={16} aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-ink">
        {typeof value === 'number' ? <CountUp value={value} kind={kind} /> : value}
      </p>
      {children}
      <p className="tile-note">{note}</p>
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
  // The summary is a bento grid: the most important figures get bigger tiles,
  // and each tile appears only if the viewer's roles include that part.
  const tiles: TileProps[] = [];
  if (can('projects')) {
    tiles.push(
      {
        icon: FolderKanban,
        label: 'Active projects',
        value: data.activeProjects,
        note: `${data.projects.completed ?? 0} completed · ${data.projects.onboarding ?? 0} onboarding`,
        href: '/projects',
        size: 'wide',
      },
      { icon: ListChecks, label: 'Pending tasks', value: data.pendingTasks, note: `${data.tasks.submitted ?? 0} waiting for review`, href: isAdmin ? '/approvals' : '/projects' },
    );
  }
  if (can('cashflow')) {
    tiles.push({ icon: Receipt, label: 'Client dues', value: data.outstanding, kind: 'money', note: 'Outstanding on open invoices', href: '/cashflow?tab=income', size: 'wide' });
  }
  tiles.push({ icon: UserCheck, label: 'My open tasks', value: data.mine.openTasks, note: 'Deliverables assigned to you', href: '/my-tasks' });
  if (can('equipment')) {
    tiles.push(
      {
        icon: Package,
        label: 'Equipment value',
        value: data.equipment.value,
        kind: 'money',
        note: `${plural(data.equipment.count, 'item')}${data.equipment.unpriced > 0 ? `, ${data.equipment.unpriced} without a price` : ''}`,
        href: '/logistics',
      },
      { icon: ShoppingCart, label: 'Urgently needed', value: data.neededItems, note: 'Items the studio needs to get', href: '/logistics' },
    );
  } else {
    tiles.push({ icon: Package, label: 'Equipment I hold', value: data.mine.equipmentHeld, note: 'Items recorded as held by you', href: '/logistics' });
  }
  if (can('costs')) {
    tiles.push({ icon: Home, label: 'Fixed monthly costs', value: data.fixedMonthly, kind: 'money', note: 'Rent, utilities and other recurring costs', href: '/logistics', size: 'wide' });
  }

  // Tallest bar = the busiest of the last six months, for the small chart on the funds tile.
  const busiest = Math.max(1, ...data.cashflow.map((point) => Math.max(point.income, point.expenses)));

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

      <div className="bento">
        {can('cashflow') ? (
          <Link href="/cashflow" className="tile tile-big tone-green" style={{ '--i': 0 } as CSSProperties}>
            <div className="flex items-center justify-between">
              <p className="tile-label">Available funds</p>
              <span className="tile-icon">
                <Wallet size={16} aria-hidden />
              </span>
            </div>
            <p className="mt-3 text-4xl font-semibold tracking-tight text-ink">
              <CountUp value={data.funds} kind="money" />
            </p>
            <p className="mt-1 text-[13px] text-muted">Across all accounts</p>
            <div className="mt-auto flex h-16 items-end gap-1.5 pt-4" aria-hidden>
              {data.cashflow.map((point) => (
                <div key={point.month} className="flex h-full flex-1 items-end gap-0.5">
                  <span className="mini-bar bg-success" style={{ height: `${Math.max(4, (point.income / busiest) * 100)}%` }} />
                  <span className="mini-bar bg-line-strong" style={{ height: `${Math.max(4, (point.expenses / busiest) * 100)}%` }} />
                </div>
              ))}
            </div>
            <p className="tile-note">
              {money(data.expensesThisMonth)} spent this month · money in and out, last 6 months
            </p>
          </Link>
        ) : null}

        <PointsTile points={data.mine.points} target={data.mine.target} month={data.month} className="tile-wide" />

        {tiles.map((tile, index) => (
          <Tile key={tile.label} {...tile} index={index + 2} />
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

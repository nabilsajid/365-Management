import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getPageContext } from '@/lib/page';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, orgId, orgName, profile, isAdmin, segments } = await getPageContext();
  const [, rolesCheck, broadcastsCheck, membersCheck, changesCheck, timesCheck, openBroadcasts, pendingOther] = await Promise.all([
    Promise.resolve({ data: null }),
    // Plain selects: a count-only request hides the "table does not exist" error.
    supabase.from('roles').select('id').limit(1),
    supabase.from('broadcasts').select('id').limit(1),
    supabase.from('project_members').select('project_id').limit(1),
    // Row level security makes these counts personal: admins get everything
    // waiting for them, everyone else only their own.
    supabase.from('change_requests').select('id').eq('org_id', orgId).eq('status', 'pending'),
    supabase.from('attendance').select('check_in').limit(1),
    supabase.from('broadcasts').select('id').eq('org_id', orgId).eq('status', 'open'),
    isAdmin
      ? Promise.all([
          supabase.from('task_submissions').select('id').eq('org_id', orgId).eq('review_status', 'pending'),
          supabase.from('attendance').select('id').eq('org_id', orgId).eq('status', 'pending'),
          supabase.from('bonuses').select('id').eq('org_id', orgId).eq('status', 'pending'),
        ])
      : Promise.resolve([]),
  ]);

  // Tell admins plainly when the database is behind the app, instead of showing empty pages.
  const missing = [
    rolesCheck.error ? '20261112000006_roles.sql' : null,
    broadcastsCheck.error ? '20261112000007_broadcasts_logistics.sql' : null,
    membersCheck.error ? '20261112000008_project_team_links.sql' : null,
    changesCheck.error ? '20261112000009_change_requests_role_colors.sql' : null,
    timesCheck.error ? '20261112000010_attendance_times.sql' : null,
  ].filter(Boolean);
  const notice =
    isAdmin && missing.length > 0
      ? `Database update needed: in the Supabase SQL Editor, run ${missing.join(' and then ')} from the supabase/migrations folder. Until then, the newest features will not work.`
      : null;

  const pendingChanges = changesCheck.data?.length ?? 0;
  const otherWaiting = (pendingOther as { data: unknown[] | null }[]).reduce(
    (total, result) => total + (result.data?.length ?? 0),
    0,
  );
  const badges: Record<string, number> = isAdmin
    ? { '/approvals': pendingChanges + otherWaiting, '/broadcasts': openBroadcasts.data?.length ?? 0 }
    : { '/requests': pendingChanges };

  return (
    <AppShell
      orgName={orgName}
      userName={profile.full_name}
      jobTitle={profile.job_title}
      isAdmin={isAdmin}
      segments={[...segments]}
      notice={notice}
      badges={badges}
    >
      <div className="page-in">{children}</div>
    </AppShell>
  );
}

import type { ReactNode } from 'react';
import { AppShell } from '@/components/shell/app-shell';
import { getPageContext } from '@/lib/page';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, orgId, orgName, profile, isAdmin, segments } = await getPageContext();
  // Counts for the sidebar badges. Row level security makes them personal:
  // admins get everything waiting for them, everyone else only their own.
  const [pendingChanges, openBroadcasts, pendingOther] = await Promise.all([
    supabase.from('change_requests').select('id').eq('org_id', orgId).eq('status', 'pending'),
    isAdmin ? supabase.from('broadcasts').select('id').eq('org_id', orgId).eq('status', 'open') : Promise.resolve({ data: [] }),
    isAdmin
      ? Promise.all([
          supabase.from('task_submissions').select('id').eq('org_id', orgId).eq('review_status', 'pending'),
          supabase.from('attendance').select('id').eq('org_id', orgId).eq('status', 'pending'),
          supabase.from('bonuses').select('id').eq('org_id', orgId).eq('status', 'pending'),
          supabase.from('password_requests').select('id').eq('org_id', orgId).eq('status', 'pending'),
        ])
      : Promise.resolve([]),
  ]);

  const changes = pendingChanges.data?.length ?? 0;
  const otherWaiting = (pendingOther as { data: unknown[] | null }[]).reduce(
    (total, result) => total + (result.data?.length ?? 0),
    0,
  );
  const badges: Record<string, number> = isAdmin
    ? { '/approvals': changes + otherWaiting, '/broadcasts': openBroadcasts.data?.length ?? 0 }
    : { '/requests': changes };

  return (
    <AppShell
      orgName={orgName}
      userName={profile.full_name}
      jobTitle={profile.job_title}
      isAdmin={isAdmin}
      segments={[...segments]}
      badges={badges}
    >
      <div className="page-in">{children}</div>
    </AppShell>
  );
}

import type { ReactNode } from 'react';
import { AssignmentPopup, type NotificationItem } from '@/components/assignment-popup';
import { PROFILE_FIELDS } from '@/components/profile-fields';
import { ApiForm } from '@/components/resource-manager';
import { AppShell } from '@/components/shell/app-shell';
import { getPageContext } from '@/lib/page';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, orgId, userId, orgName, profile, isAdmin, segments, preview } = await getPageContext();
  // Counts for the sidebar badges. Row level security makes them personal:
  // admins get everything waiting for them, everyone else only their own.
  const [pendingChanges, openBroadcasts, pendingOther, unread] = await Promise.all([
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
    // New assignments, shown in a pop-up until the person has seen them.
    supabase.from('notifications').select('id, title, body, href').eq('profile_id', userId).is('read_at', null).order('created_at', { ascending: false }).limit(8),
  ]);
  const notifications = ((unread.data ?? []) as NotificationItem[]);

  const changes = pendingChanges.data?.length ?? 0;
  const otherWaiting = (pendingOther as { data: unknown[] | null }[]).reduce(
    (total, result) => total + (result.data?.length ?? 0),
    0,
  );
  const badges: Record<string, number> = isAdmin
    ? { '/approvals': changes + otherWaiting, '/broadcasts': openBroadcasts.data?.length ?? 0 }
    : { '/requests': changes };

  // The very first sign-in: everyone fills in their profile before using the app.
  // The column check keeps the app usable until the profiles database update has been run.
  const needsProfile = 'profile_completed_at' in profile && !profile.profile_completed_at;

  return (
    <AppShell
      orgName={orgName}
      userName={profile.full_name}
      jobTitle={profile.job_title}
      isAdmin={isAdmin}
      segments={[...segments]}
      badges={badges}
      previewRole={preview?.roleName ?? null}
    >
      <div className="page-in">
        {needsProfile ? (
          <section className="panel mx-auto max-w-2xl">
            <header className="panel-header">
              <div>
                <h2>Welcome to {orgName}</h2>
                <p className="muted">
                  Before you start, please fill in your profile. Your name and contact number are visible to the team;
                  your address and secondary contact are visible only to you and the admins. You can change these any
                  time under Profiles.
                </p>
              </div>
            </header>
            <ApiForm
              endpoint="/api/profile"
              method="PATCH"
              submitLabel="Save and continue"
              resetOnSuccess={false}
              fields={PROFILE_FIELDS}
              initial={{ full_name: profile.full_name, contact: profile.contact ?? null, nickname: profile.nickname ?? null }}
            />
          </section>
        ) : (
          children
        )}
        {!needsProfile && notifications.length > 0 ? (
          <AssignmentPopup key={notifications.map((item) => item.id).join()} items={notifications} />
        ) : null}
      </div>
    </AppShell>
  );
}

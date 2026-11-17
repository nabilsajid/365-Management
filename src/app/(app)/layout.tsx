import { after } from 'next/server';
import type { ReactNode } from 'react';
import { AssignmentPopup, type NotificationItem } from '@/components/assignment-popup';
import { GuideWelcome } from '@/components/guide-welcome';
import { LiveRefresh } from '@/components/live-refresh';
import { OfflineStatus } from '@/components/offline-status';
import { PROFILE_FIELDS } from '@/components/profile-fields';
import { ApiForm } from '@/components/resource-manager';
import { hiddenSections } from '@/lib/domain/sections';
import { AppShell } from '@/components/shell/app-shell';
import { appearanceCss } from '@/lib/domain/appearance';
import { wants } from '@/lib/domain/notification-kind';
import { soonLimit } from '@/lib/domain/deadlines';
import { getPageContext } from '@/lib/page';
import { dispatchPushes, pushConfigured } from '@/lib/server/push';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { supabase, orgId, userId, orgName, profile, isAdmin, segments, preview, owner, companyView, localDate } = await getPageContext();
  const today = localDate(new Date().toISOString());
  // Counts for the sidebar badges. Row level security makes them personal:
  // admins get everything waiting for them, everyone else only their own.
  const [pendingChanges, openBroadcasts, pendingOther, unread, look, dueSoon, checkoutRequests, logoRow, photoRow, waitingEmails] = await Promise.all([
    supabase.from('change_requests').select('id').eq('org_id', orgId).eq('status', 'pending'),
    // Open broadcasts to the admins (for admins), or open personal messages (for everyone else).
    supabase.from('broadcasts').select('*').eq('org_id', orgId).eq('status', 'open'),
    isAdmin
      ? Promise.all([
          supabase.from('task_submissions').select('id').eq('org_id', orgId).eq('review_status', 'pending'),
          supabase.from('attendance').select('id').eq('org_id', orgId).eq('status', 'pending'),
          supabase.from('bonuses').select('id').eq('org_id', orgId).eq('status', 'pending'),
          supabase.from('password_requests').select('id').eq('org_id', orgId).eq('status', 'pending'),
          // Finished projects whose team has not been given points yet.
          supabase.from('projects').select('id').eq('org_id', orgId).eq('status', 'completed').is('points_awarded_at', null),
          supabase.from('leave_requests').select('id').eq('org_id', orgId).eq('status', 'pending'),
        ])
      : Promise.resolve([]),
    // New assignments, shown in a pop-up until the person has seen them.
    supabase.from('notifications').select('id, title, body, href').eq('profile_id', userId).is('read_at', null).order('created_at', { ascending: false }).limit(8),
    // The company's chosen look. Before the appearance update this simply fails and the built-in look is used.
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    // The person's own unfinished work that is overdue or due within two days: a red marker on My Tasks.
    supabase.from('tasks').select('id, project:projects(status)').eq('org_id', orgId).eq('assignee_id', userId).lte('due_date', soonLimit(today)).not('status', 'in', '(submitted,approved)'),
    // Equipment requests waiting for a decision (admins).
    isAdmin ? supabase.from('equipment_checkouts').select('id').eq('org_id', orgId).eq('status', 'requested') : Promise.resolve({ data: [] }),
    // The company's logo and the person's photo (both optional).
    supabase.from('org_logos').select('data').eq('org_id', orgId).maybeSingle(),
    supabase.from('profile_photos').select('data').eq('profile_id', userId).maybeSingle(),
    // Emails waiting for approval, for admins and email approvers.
    isAdmin || segments.has('emails')
      ? supabase.from('email_outbox').select('id', { count: 'exact', head: true }).eq('org_id', orgId).in('status', ['pending', 'failed'])
      : Promise.resolve({ count: 0 }),
  ]);
  const lookCss = !look.error && look.data?.appearance && Object.keys(look.data.appearance).length > 0 ? appearanceCss(look.data.appearance) : null;
  // Only the kinds this person wants; they choose under Profiles & Contacts, My profile.
  const prefs = (profile as { notify_prefs?: unknown }).notify_prefs;
  const notifications = ((unread.data ?? []) as NotificationItem[]).filter((item) => wants(prefs, item.href));

  // Whatever anyone just did may have created notifications; send them to people's devices once this page is out.
  if (pushConfigured()) after(dispatchPushes);

  const waitingUpdates = (openBroadcasts.data ?? []) as { recipient_id?: string | null }[];
  const changes = pendingChanges.data?.length ?? 0;
  const otherWaiting = (pendingOther as { data: unknown[] | null }[]).reduce(
    (total, result) => total + (result.data?.length ?? 0),
    0,
  );
  const badges: Record<string, number> = isAdmin
    ? { '/approvals': changes + otherWaiting, '/updates': waitingUpdates.filter((row) => !row.recipient_id).length }
    : { '/requests': changes, '/updates': waitingUpdates.filter((row) => row.recipient_id === userId).length };
  // Not counting tasks of hidden (finished) projects.
  badges['/my-tasks'] = ((dueSoon.data ?? []) as { project?: { status?: string } | null }[]).filter((row) => row.project?.status !== 'archived').length;
  if (isAdmin) badges['/logistics'] = checkoutRequests.data?.length ?? 0;
  // Emails waiting for approval count toward Approvals.
  const emailsWaiting = (waitingEmails as { count?: number | null }).count ?? 0;
  badges['/approvals'] = (badges['/approvals'] ?? 0) + emailsWaiting;

  // The very first sign-in: everyone fills in their profile before using the app.
  // The column check keeps the app usable until the profiles database update has been run.
  const needsProfile = 'profile_completed_at' in profile && !profile.profile_completed_at;
  // Not shown to the owner while working inside another company.
  const welcomeGuide = 'guide_seen_at' in profile && !(profile as { guide_seen_at?: string | null }).guide_seen_at && !companyView;

  return (
    <>
      {/* Only checked colour values and fixed words reach this; see appearanceCss. */}
      {lookCss ? <style id="appearance" dangerouslySetInnerHTML={{ __html: lookCss }} /> : null}
    <AppShell
      orgLogo={(logoRow.data as { data?: string } | null)?.data ?? null}
      userPhoto={(photoRow.data as { data?: string } | null)?.data ?? null}
      hiddenSections={look.error ? [] : hiddenSections((look.data as { settings?: unknown } | null)?.settings)}
      orgName={orgName}
      userName={profile.full_name}
      jobTitle={profile.job_title}
      isAdmin={isAdmin}
      segments={[...segments]}
      badges={badges}
      previewRole={preview?.roleName ?? null}
      owner={Boolean(owner)}
      viewingCompany={companyView?.orgName ?? null}
    >
      <LiveRefresh orgId={orgId} />
      <OfflineStatus userId={userId} />
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
        {/* Right after the first profile is saved, the team guide is offered once; other pop-ups wait. */}
        {!needsProfile && welcomeGuide ? (
          <GuideWelcome firstName={(profile.nickname || profile.full_name).split(' ')[0]} orgName={orgName} />
        ) : !needsProfile && notifications.length > 0 ? (
          <AssignmentPopup key={notifications.map((item) => item.id).join()} items={notifications} />
        ) : null}
      </div>
    </AppShell>
    </>
  );
}

import { NoticeList } from '@/components/notice-list';
import { ApiForm, ResourceManager } from '@/components/resource-manager';
import { NOTICE_DURATIONS, isNoticeActive, noticeTimeLeft, sortNotices } from '@/lib/domain/notices';
import { asRows, getPageContext, rowsOf } from '@/lib/page';
import type { Notice, Profile } from '@/types/database';

const DURATION_OPTIONS = NOTICE_DURATIONS.map((option) => ({ value: option.value, label: option.label }));

export default async function NoticesPage() {
  const { supabase, orgId, isAdmin, localDateTime } = await getPageContext();

  // Row level security hides expired notices from everyone except admins.
  const [noticesR, peopleR] = await Promise.all([
    supabase.from('notices').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
  ]);
  const author = new Map(rowsOf<Pick<Profile, 'id' | 'full_name'>>(peopleR.data).map((person) => [person.id, person.full_name]));
  const now = new Date();

  const all = sortNotices(rowsOf<Notice>(noticesR.data)).map((notice) => ({
    ...notice,
    posted: localDateTime(notice.created_at),
    author: notice.created_by ? (author.get(notice.created_by) ?? null) : null,
    shows: noticeTimeLeft(notice.expires_at, now),
  }));
  const active = all.filter((notice) => isNoticeActive(notice.expires_at, now));

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Notice Board</h1>
          <p className="muted">
            {isAdmin
              ? 'Post emergency information and updates for the whole team, and choose how long each one stays up.'
              : 'Emergency information and updates from the admins.'}
          </p>
        </div>
      </div>

      {noticesR.error ? (
        <section className="panel">
          <p className="muted">
            The notice board needs a database update first. An admin has to run the file
            <code> 20261112000013_profiles_notices.sql </code>
            in the Supabase SQL Editor, then reload this page.
          </p>
        </section>
      ) : (
        <>
          {isAdmin ? (
            <section className="panel">
              <header className="panel-header">
                <div>
                  <h2>Post a notice</h2>
                  <p className="muted">Everyone sees it on their dashboard until the time you choose runs out.</p>
                </div>
              </header>
              <ApiForm
                endpoint="/api/notices"
                submitLabel="Post notice"
                initial={{ duration: '1w', is_urgent: false }}
                fields={[
                  { name: 'title', label: 'Title', required: true, placeholder: 'Office closed on Friday' },
                  { name: 'duration', label: 'Keep visible for', type: 'select', required: true, options: DURATION_OPTIONS },
                  { name: 'body', label: 'Details', type: 'textarea', placeholder: 'Anything the team needs to know.' },
                  { name: 'is_urgent', label: 'Mark as urgent', type: 'checkbox' },
                ]}
              />
            </section>
          ) : null}

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>On the board now</h2>
              </div>
            </header>
            {active.length > 0 ? <NoticeList notices={active} now={now} /> : <p className="muted">No data found.</p>}
          </section>

          {isAdmin ? (
            <ResourceManager
              title="Manage notices"
              description="Edit or delete a notice. Expired notices are hidden from the team and stay here until you delete them."
              endpoint="/api/notices"
              rows={asRows(all)}
              columns={[
                { key: 'title', label: 'Title' },
                { key: 'is_urgent', label: 'Urgent', kind: 'bool' },
                { key: 'posted', label: 'Posted' },
                { key: 'shows', label: 'Visible' },
              ]}
              editFields={[
                { name: 'title', label: 'Title', required: true },
                { name: 'duration', label: 'Keep visible for', type: 'select', options: DURATION_OPTIONS, hint: 'Counts from now. Leave empty to keep the current time.' },
                { name: 'body', label: 'Details', type: 'textarea' },
                { name: 'is_urgent', label: 'Mark as urgent', type: 'checkbox' },
              ]}
              canWrite
              allowCreate={false}
              emptyText="No data found."
            />
          ) : null}
        </>
      )}
    </>
  );
}

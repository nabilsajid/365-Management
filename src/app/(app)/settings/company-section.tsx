import { ApiForm } from '@/components/resource-manager';
import { LogoUploader } from '@/components/image-tools';
import { MailSettingsForm } from '@/components/mail-settings-form';
import { TestAlertButton } from '@/components/test-alert-button';
import { createAdminClient } from '@/lib/supabase/admin';
import { whatsappConfigured } from '@/lib/server/urgent-alerts';
import { FeatureSettings, ReminderSettingsForm } from '@/components/settings-toggles';
import { hiddenSections, reminderSettings } from '@/lib/domain/sections';
import { getPageContext } from '@/lib/page';

type Org = {
  name?: string;
  trade_license?: string | null;
  contact_address?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website?: string | null;
  settings?: unknown;
};

function NeedsUpdate() {
  return (
    <section className="panel">
      <p className="muted">These settings arrive with the next database update. Reload this page in a minute.</p>
    </section>
  );
}

/** Company details printed on invoices, and which optional sections show in the menu. */
export async function CompanySection() {
  const { supabase, orgId } = await getPageContext();
  const [{ data, error }, logoResult] = await Promise.all([
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('org_logos').select('data').eq('org_id', orgId).maybeSingle(),
  ]);
  const org = (data ?? {}) as Org;
  if (error || !('settings' in org)) return <NeedsUpdate />;
  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Company details</h2>
            <p className="muted">
              Your company&apos;s name, trade licence and contact details. They show in the menu and on invoices, and you
              can change them any time.
            </p>
          </div>
        </header>
        <ApiForm
          endpoint="/api/org-settings"
          method="PATCH"
          submitLabel="Save details"
          resetOnSuccess={false}
          initial={{
            name: org.name ?? '',
            trade_license: org.trade_license ?? '',
            contact_address: org.contact_address ?? '',
            contact_phone: org.contact_phone ?? '',
            contact_email: org.contact_email ?? '',
            website: org.website ?? '',
          }}
          fields={[
            { name: 'name', label: 'Company name', required: true },
            { name: 'trade_license', label: 'Trade licence no. (optional)' },
            { name: 'contact_address', label: 'Address', placeholder: 'House 12, Road 5, Dhanmondi, Dhaka' },
            { name: 'contact_phone', label: 'Phone', placeholder: '+880 1…' },
            { name: 'contact_email', label: 'Email', type: 'email' },
            { name: 'website', label: 'Website', placeholder: 'www.365frames.com' },
          ]}
        />
      </section>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Logo</h2>
            <p className="muted">Your company&apos;s logo, for invoices and the menu.</p>
          </div>
        </header>
        <LogoUploader current={(logoResult.data as { data?: string } | null)?.data ?? null} />
      </section>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Features</h2>
            <p className="muted">
              Choose what your company uses. Turning a feature off changes the menu for everyone; you choose whether its
              data is kept or deleted.
            </p>
          </div>
        </header>
        <FeatureSettings initial={hiddenSections(org.settings)} />
      </section>
    </>
  );
}

/** Which automatic reminders the app sends every morning. */
export async function RemindersSection() {
  const { supabase, orgId } = await getPageContext();
  // The mailbox alerts are sent from (never its password).
  const adminDb = createAdminClient();
  const mailR = adminDb ? await adminDb.from('org_mail_settings').select('provider, username, from_name, host, port').eq('org_id', orgId).maybeSingle() : { data: null };
  const mail = (mailR.data ?? null) as { provider: string; username: string; from_name: string | null; host: string; port: number } | null;
  const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
  const org = (data ?? {}) as Org;
  if (error || !('settings' in org)) return <NeedsUpdate />;
  return (
    <>
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Reminders</h2>
          <p className="muted">Sent automatically every morning. Assignment and change notifications are always on.</p>
        </div>
      </header>
      <ReminderSettingsForm initial={reminderSettings(org.settings)} />
    </section>
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Email alerts</h2>
          <p className="muted">
            {mail
              ? `Everyone gets their urgent alerts by email from ${mail.username}, once a day.`
              : 'Choose the email address urgent alerts are sent from. Everyone in the team then gets them from that address, once a day.'}
          </p>
        </div>
      </header>
      <details className="fold-inline" style={{ marginBottom: '0.75rem' }}>
        <summary>What goes by email, and to whom</summary>
        <ul className="message-list">
          <li><strong>Deadline missed</strong>: the person assigned, and admins.</li>
          <li><strong>Project past its due date</strong>: the project&apos;s team, and admins.</li>
          <li><strong>Shoot not confirmed</strong> (shoots coming up within the days set above): the team or the person assigned, and admins.</li>
          <li><strong>Please return</strong> (equipment past its return date): the person holding it.</li>
          <li><strong>Equipment overdue</strong>: admins.</li>
          <li><strong>Invoice overdue</strong>: admins.</li>
        </ul>
        <p className="muted" style={{ fontSize: '0.8rem' }}>
          Also a <strong>salary email</strong> to each person when their payslip is paid. Everything else (new tasks,
          comments, approvals, leave) stays in the app and on phones. Each person gets at most one alert email a day,
          prepared around 7 AM and listing all their items. <strong>Nothing is sent until it is approved</strong> on the
          Email approvals page, by an admin or someone whose role has &quot;Approve emails&quot;. Switching a reminder off
          above stops its email too.
        </p>
      </details>
      <MailSettingsForm saved={mail} />
      <div style={{ marginTop: '1rem' }}>
        <TestAlertButton />
      </div>
      <p className="muted" style={{ fontSize: '0.8rem', marginTop: '0.75rem' }}>
        WhatsApp: {whatsappConfigured() ? 'set up' : 'not set up (needs a Meta WhatsApp Business account)'}.
      </p>
    </section>
    </>
  );
}

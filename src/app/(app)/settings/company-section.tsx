import { ApiForm } from '@/components/resource-manager';
import { LogoUploader } from '@/components/image-tools';
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
  const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
  const org = (data ?? {}) as Org;
  if (error || !('settings' in org)) return <NeedsUpdate />;
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Reminders</h2>
          <p className="muted">Sent automatically every morning. Assignment and change notifications are always on.</p>
        </div>
      </header>
      <ReminderSettingsForm initial={reminderSettings(org.settings)} />
    </section>
  );
}

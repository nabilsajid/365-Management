import { ApiForm } from '@/components/resource-manager';
import { ReminderSettingsForm, SectionSettingsForm } from '@/components/settings-toggles';
import { hiddenSections, reminderSettings } from '@/lib/domain/sections';
import { getPageContext } from '@/lib/page';

type Org = {
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
  const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
  const org = (data ?? {}) as Org;
  if (error || !('settings' in org)) return <NeedsUpdate />;
  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Company details</h2>
            <p className="muted">Printed under your company name on invoices, when “Company name” is on in the invoice options.</p>
          </div>
        </header>
        <ApiForm
          endpoint="/api/org-settings"
          method="PATCH"
          submitLabel="Save details"
          resetOnSuccess={false}
          initial={{
            contact_address: org.contact_address ?? '',
            contact_phone: org.contact_phone ?? '',
            contact_email: org.contact_email ?? '',
            website: org.website ?? '',
          }}
          fields={[
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
            <h2>Menu sections</h2>
            <p className="muted">Switch off sections your company does not use. Their data is kept; switch them back on any time.</p>
          </div>
        </header>
        <SectionSettingsForm initial={hiddenSections(org.settings)} />
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

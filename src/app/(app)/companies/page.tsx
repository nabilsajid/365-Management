import { Building2, Users } from 'lucide-react';
import { redirect } from 'next/navigation';
import { OpenCompanyButton } from '@/components/company-switch';
import { ApiForm } from '@/components/resource-manager';
import { getPageContext } from '@/lib/page';
import { createAdminClient } from '@/lib/supabase/admin';

const TIMEZONES = ['Asia/Dhaka', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Asia/Jakarta', 'Europe/London', 'Europe/Berlin', 'Africa/Johannesburg', 'America/New_York', 'UTC'];
const CURRENCIES = ['BDT', 'USD', 'EUR', 'GBP', 'INR', 'AED', 'IDR', 'ZAR'];

// Owner only: every company using the app. Open one to work in it as its admin,
// or add a new company with its first admin.
export default async function CompaniesPage() {
  const { owner, companyView, orgId } = await getPageContext();
  if (!owner) redirect('/dashboard');
  const admin = createAdminClient();
  const homeOrgId = companyView?.homeOrgId ?? orgId;

  const [orgs, people] = admin
    ? await Promise.all([
        admin.from('organizations').select('id, name, timezone, currency, created_at').order('created_at'),
        admin.from('profiles').select('org_id, is_active'),
      ])
    : [{ data: [] }, { data: [] }];
  const counts = new Map<string, number>();
  for (const row of (people.data ?? []) as { org_id: string; is_active: boolean }[]) {
    if (row.is_active) counts.set(row.org_id, (counts.get(row.org_id) ?? 0) + 1);
  }
  const companies = (orgs.data ?? []) as { id: string; name: string; timezone: string; currency: string; created_at: string }[];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Companies</h1>
          <p className="muted">
            Every company using UniDock. Each one only ever sees its own people and data. Open one to work in it as its
            admin.
          </p>
        </div>
      </div>

      {!admin ? (
        <section className="panel">
          <p className="muted">Managing companies needs SUPABASE_SERVICE_ROLE_KEY to be set on the server.</p>
        </section>
      ) : null}

      <div className="company-grid">
        {companies.map((company) => {
          const home = company.id === homeOrgId;
          const here = company.id === orgId;
          return (
            <section key={company.id} className={here ? 'panel company-card current' : 'panel company-card'}>
              <div className="company-card-head">
                <span className="company-icon" aria-hidden>
                  <Building2 size={18} />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate">{company.name}</h2>
                  <p className="muted">
                    {home ? 'Your company' : 'Customer'} · {company.timezone} · {company.currency}
                  </p>
                </div>
              </div>
              <p className="muted flex items-center gap-1.5">
                <Users size={14} aria-hidden /> {counts.get(company.id) ?? 0} {counts.get(company.id) === 1 ? 'person' : 'people'}
              </p>
              {here ? (
                <span className="badge badge-approved">You are here</span>
              ) : (
                <OpenCompanyButton orgId={company.id} home={home} label={home ? 'Back to my company' : 'Open as admin'} />
              )}
            </section>
          );
        })}
      </div>

      <details className="panel fold">
        <summary>Add a company</summary>
        <p className="muted">
          The company starts empty with the standard roles and point rules. Its admin signs in with the email and
          password below, then adds their own team. Send them the login details yourself.
        </p>
        <ApiForm
          endpoint="/api/companies"
          submitLabel="Add company"
          fields={[
            { name: 'name', label: 'Company name', required: true },
            { name: 'timezone', label: 'Time zone', type: 'select', required: true, defaultValue: 'Asia/Dhaka', options: TIMEZONES.map((zone) => ({ value: zone, label: zone })) },
            { name: 'currency', label: 'Currency', type: 'select', required: true, defaultValue: 'BDT', options: CURRENCIES.map((code) => ({ value: code, label: code })) },
            { name: 'admin_name', label: "Admin's full name", required: true },
            { name: 'admin_email', label: "Admin's email (their login)", type: 'email', required: true },
            { name: 'admin_password', label: "Admin's first password", required: true, hint: 'At least 6 characters. They can change it after signing in.' },
          ]}
        />
      </details>
    </>
  );
}

import { Building2, Users } from 'lucide-react';
import { redirect } from 'next/navigation';
import { DeleteCompanyButton, OpenCompanyButton } from '@/components/company-switch';
import { CompanyWizard } from '@/components/company-wizard';
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

  const [orgs, people, logoRows] = admin
    ? await Promise.all([
        admin.from('organizations').select('id, name, timezone, currency, created_at').order('created_at'),
        admin.from('profiles').select('org_id, is_active'),
        admin.from('org_logos').select('org_id, data'),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const logos = new Map(((logoRows.data ?? []) as { org_id: string; data: string }[]).map((row) => [row.org_id, row.data]));
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
            All your companies. Each one only ever sees its own people and data. Switch to one to work in it.
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {logos.get(company.id) ? <img src={logos.get(company.id)} alt="" /> : <Building2 size={18} />}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate">{company.name}</h2>
                  <p className="muted">
                    {company.timezone} · {company.currency}
                  </p>
                </div>
              </div>
              <p className="muted flex items-center gap-1.5">
                <Users size={14} aria-hidden /> {counts.get(company.id) ?? 0} {counts.get(company.id) === 1 ? 'person' : 'people'}
              </p>
              {here ? (
                <span className="badge badge-approved">You are here</span>
              ) : (
                <OpenCompanyButton orgId={company.id} home={home} label={`Switch to ${company.name}`} />
              )}
              {!home && !here ? <DeleteCompanyButton orgId={company.id} name={company.name} /> : null}
            </section>
          );
        })}
      </div>

      <details className="panel fold">
        <summary>Add a company</summary>
        <CompanyWizard timezones={TIMEZONES} currencies={CURRENCIES} />
      </details>
    </>
  );
}

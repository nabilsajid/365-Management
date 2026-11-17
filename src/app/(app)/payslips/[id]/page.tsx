import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PrintButton } from '@/components/print-button';
import { netPay } from '@/lib/domain/payroll';
import { money } from '@/lib/format';
import { getPageContext } from '@/lib/page';

type Payslip = {
  id: string;
  profile_id: string;
  month: string;
  base_salary: number;
  bonus: number;
  additions: number;
  deductions: number;
  days_present: number;
  leave_days: number;
  points: number;
  note: string | null;
  status: string;
  paid_on: string | null;
};

// One payslip, ready to print or save as a PDF. Admins see any; a person sees
// their own once it is paid (row level security decides).
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, orgId, isAdmin } = await getPageContext();
  const result = await supabase.from('payslips').select('*').eq('id', id).eq('org_id', orgId).maybeSingle();
  if (!result.data) notFound();
  const slip = result.data as Payslip;
  const [personR, orgR, logoR] = await Promise.all([
    supabase.from('profiles').select('full_name, job_title').eq('id', slip.profile_id).maybeSingle(),
    supabase.from('organizations').select('*').eq('id', orgId).maybeSingle(),
    supabase.from('org_logos').select('data').eq('org_id', orgId).maybeSingle(),
  ]);
  const person = personR.data as { full_name: string; job_title: string | null } | null;
  const org = orgR.data as { name: string; contact_address?: string | null; trade_license?: string | null } | null;
  const logo = (logoR.data as { data?: string } | null)?.data ?? '/logo-dark.png';
  const monthLabel = new Date(`${slip.month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const rows: [string, number, 'add' | 'less'][] = [
    ['Monthly salary', Number(slip.base_salary), 'add'],
    ['Bonus (earned through points)', Number(slip.bonus), 'add'],
    ['Other additions', Number(slip.additions), 'add'],
    ['Deductions', Number(slip.deductions), 'less'],
  ];

  return (
    <>
      <div className="page-header no-print">
        <div>
          <p className="muted">
            {isAdmin ? <Link href={`/employees?tab=payroll&month=${slip.month.slice(0, 7)}`}>Payroll</Link> : <Link href="/profile">My profile</Link>} / Payslip
          </p>
          <h1>Payslip · {monthLabel}</h1>
        </div>
        <PrintButton />
      </div>
      <article className="invoice-sheet">
        <div className="invoice-top">
          <div className="invoice-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logo} alt={org?.name ?? ''} className="invoice-logo" style={{ objectFit: 'contain', objectPosition: 'left' }} />
            <p className="invoice-muted">{org?.name}</p>
            {org?.contact_address ? <p className="invoice-muted">{org.contact_address}</p> : null}
            {org?.trade_license ? <p className="invoice-muted">Trade licence {org.trade_license}</p> : null}
          </div>
          <div>
            <h1>Payslip</h1>
            <p className="invoice-muted">{monthLabel}</p>
            <p className="invoice-muted">{slip.status === 'paid' ? `Paid on ${slip.paid_on}` : 'Draft, not paid yet'}</p>
          </div>
        </div>
        <div>
          <p style={{ margin: 0, fontWeight: 600 }}>{person?.full_name}</p>
          {person?.job_title ? <p className="invoice-muted">{person.job_title}</p> : null}
        </div>
        <table>
          <tbody>
            {rows.map(([label, value, sign]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="amount">
                  {sign === 'less' && value > 0 ? '− ' : ''}
                  {money(value)}
                </td>
              </tr>
            ))}
            <tr className="total">
              <td>Take-home pay</td>
              <td className="amount">{money(netPay(slip))}</td>
            </tr>
          </tbody>
        </table>
        <p className="invoice-muted">
          This month: {slip.days_present} days present · {slip.leave_days} days on leave · {slip.points} points
        </p>
        {slip.note ? <p className="invoice-muted" style={{ whiteSpace: 'pre-wrap' }}>{slip.note}</p> : null}
      </article>
    </>
  );
}

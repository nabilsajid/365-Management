import { requireContext } from '@/lib/api/context';
import { fail } from '@/lib/api/http';
import { leaveDaysInMonth, netPay } from '@/lib/domain/payroll';
import { nextMonth, parseMonth } from '@/lib/domain/points';
import { workbook, type CellValue } from '@/lib/server/xlsx';

type Row = Record<string, unknown>;
const rows = (result: { data: unknown }) => (result.data ?? []) as Row[];
const num = (value: unknown) => (value === null || value === undefined || value === '' ? null : Number(value));

// Admin: one month as an Excel file for the accountant: a summary, money in,
// money out, invoices, investments, payroll and the team's month.
export async function GET(request: Request): Promise<Response> {
  const auth = await requireContext('admin');
  if (auth.response) return auth.response;
  const { ctx } = auth;
  const month = parseMonth(new URL(request.url).searchParams.get('month') ?? undefined);
  if (!month) return fail(400, 'Choose a month, like ?month=2026-11.');
  const until = nextMonth(month);
  const orgId = ctx.profile.org_id;
  const db = ctx.supabase;

  const [org, payments, expenses, invoices, clients, accounts, people, investments, investors, payslips, points, attendance, leave] = await Promise.all([
    db.from('organizations').select('name, currency').eq('id', orgId).maybeSingle(),
    db.from('payments').select('paid_on, amount, method, note, invoice_id, account_id').eq('org_id', orgId).gte('paid_on', month).lt('paid_on', until).order('paid_on'),
    db.from('expenses').select('expense_date, category, description, amount, account_id').eq('org_id', orgId).gte('expense_date', month).lt('expense_date', until).order('expense_date'),
    db.from('invoices').select('id, invoice_number, issue_date, due_date, amount, status, client_id').eq('org_id', orgId),
    db.from('clients').select('id, name').eq('org_id', orgId),
    db.from('accounts').select('id, name').eq('org_id', orgId),
    db.from('profiles').select('id, full_name, is_active').eq('org_id', orgId).order('full_name'),
    db.from('investments').select('received_on, amount, note, investor_id, account_id').eq('org_id', orgId).gte('received_on', month).lt('received_on', until),
    db.from('investors').select('id, name').eq('org_id', orgId),
    db.from('payslips').select('*').eq('org_id', orgId).eq('month', month),
    db.from('monthly_points').select('employee_id, total_points').eq('org_id', orgId).eq('period_month', month),
    db.from('attendance').select('employee_id').eq('org_id', orgId).eq('status', 'verified').gte('work_date', month).lt('work_date', until),
    db.from('leave_requests').select('employee_id, start_date, end_date').eq('org_id', orgId).eq('status', 'approved').lt('start_date', until).gte('end_date', month),
  ]);

  const name = (list: Row[]) => new Map(list.map((row) => [row.id as string, String(row.name ?? row.full_name ?? '')]));
  const clientName = name(rows(clients));
  const accountName = name(rows(accounts));
  const personName = name(rows(people));
  const investorName = name(rows(investors));
  const invoiceList = rows(invoices);
  const invoiceById = new Map(invoiceList.map((row) => [row.id as string, row]));

  const moneyIn = rows(payments).map((row): CellValue[] => {
    const invoice = invoiceById.get(row.invoice_id as string);
    return [row.paid_on as string, num(row.amount), invoice ? String(invoice.invoice_number) : '', invoice ? (clientName.get(invoice.client_id as string) ?? '') : '', accountName.get(row.account_id as string) ?? '', (row.method as string) ?? '', (row.note as string) ?? ''];
  });
  const invested = rows(investments).map((row): CellValue[] => [row.received_on as string, num(row.amount), investorName.get(row.investor_id as string) ?? '', accountName.get(row.account_id as string) ?? '', (row.note as string) ?? '']);
  const moneyOut = rows(expenses).map((row): CellValue[] => [row.expense_date as string, num(row.amount), String(row.category), row.description as string, accountName.get(row.account_id as string) ?? '']);
  const issued = invoiceList
    .filter((row) => (row.issue_date as string) >= month && (row.issue_date as string) < until)
    .map((row): CellValue[] => [row.invoice_number as string, row.issue_date as string, (row.due_date as string) ?? '', clientName.get(row.client_id as string) ?? '', num(row.amount), String(row.status)]);
  const slips = rows(payslips).map((row): CellValue[] => [
    personName.get(row.profile_id as string) ?? '',
    num(row.base_salary),
    num(row.bonus),
    num(row.additions),
    num(row.deductions),
    netPay(row as never),
    String(row.status),
    (row.paid_on as string) ?? '',
  ]);
  const team = rows(people)
    .filter((row) => row.is_active)
    .map((row): CellValue[] => [
      row.full_name as string,
      Number(rows(points).find((item) => item.employee_id === row.id)?.total_points ?? 0),
      rows(attendance).filter((item) => item.employee_id === row.id).length,
      leaveDaysInMonth(rows(leave).filter((item) => item.employee_id === row.id) as { start_date: string; end_date: string }[], month),
    ]);

  const sum = (list: CellValue[][], index: number) => list.reduce((total, row) => total + (Number(row[index]) || 0), 0);
  const label = new Date(`${month}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const orgRow = org.data as { name?: string; currency?: string } | null;
  const income = sum(moneyIn, 1);
  const investedTotal = sum(invested, 1);
  const spent = sum(moneyOut, 1);

  const bytes = workbook([
    {
      name: 'Summary',
      widths: [34, 18],
      rows: [
        [`${orgRow?.name ?? ''} · ${label}`, `Currency: ${orgRow?.currency ?? ''}`],
        ['Client payments received', income],
        ['Investments received', investedTotal],
        ['Money out (all expenses)', spent],
        ['Net cash for the month', income + investedTotal - spent],
        ['Invoices issued', issued.length],
        ['Invoiced amount', sum(issued, 4)],
        ['Payroll (take-home, all payslips)', sum(slips, 5)],
      ],
    },
    { name: 'Money in', widths: [12, 14, 16, 24, 18, 14, 30], rows: [['Date', 'Amount', 'Invoice', 'Client', 'Account', 'Method', 'Note'], ...moneyIn] },
    { name: 'Investments', widths: [12, 14, 24, 18, 30], rows: [['Date', 'Amount', 'Investor', 'Account', 'Note'], ...invested] },
    { name: 'Money out', widths: [12, 14, 14, 44, 18], rows: [['Date', 'Amount', 'Category', 'Description', 'Account'], ...moneyOut] },
    { name: 'Invoices', widths: [18, 12, 12, 24, 14, 10], rows: [['Invoice', 'Issued', 'Due', 'Client', 'Amount', 'Status'], ...issued] },
    { name: 'Payroll', widths: [24, 12, 12, 12, 12, 14, 8, 12], rows: [['Employee', 'Salary', 'Bonus', 'Additions', 'Deductions', 'Take-home', 'Status', 'Paid on'], ...slips] },
    { name: 'Team', widths: [24, 10, 14, 14], rows: [['Employee', 'Points', 'Days present', 'Days on leave'], ...team] },
  ]);

  const file = `${(orgRow?.name ?? 'UniDock').replace(/[^\w-]+/g, '-')}-${month.slice(0, 7)}.xlsx`;
  return new Response(Buffer.from(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file}"`,
      'Cache-Control': 'no-store',
    },
  });
}

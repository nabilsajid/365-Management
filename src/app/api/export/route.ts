import { requireContext } from '@/lib/api/context';
import { fail } from '@/lib/api/http';
import { monthRange, toCsv, type CsvValue } from '@/lib/domain/csv';

type Kind = 'expenses' | 'payments' | 'invoices' | 'points' | 'attendance';
// Money needs access to Cash Flow; points and attendance need access to Employees.
const SECTION: Record<Kind, string> = { expenses: 'cashflow', payments: 'cashflow', invoices: 'cashflow', points: 'employees', attendance: 'employees' };

type Named = { id: string; full_name?: string; name?: string; invoice_number?: string };
const names = (rows: unknown) => new Map(((rows ?? []) as Named[]).map((row) => [row.id, row.full_name ?? row.name ?? row.invoice_number ?? '']));

// One month of records as a CSV file that opens in Excel or Google Sheets.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const kind = url.searchParams.get('type') as Kind | null;
  const month = url.searchParams.get('month') ?? '';
  if (!kind || !(kind in SECTION)) return fail(400, 'Choose what to export.');
  const range = monthRange(month);
  if (!range) return fail(400, 'Choose a month.');
  const auth = await requireContext([SECTION[kind]]);
  if (auth.response) return auth.response;
  const { supabase, profile } = auth.ctx;
  const orgId = profile.org_id;
  const { from, until } = range;

  const [peopleR, clientsR, projectsR, accountsR] = await Promise.all([
    supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
    supabase.from('clients').select('id, name').eq('org_id', orgId),
    supabase.from('projects').select('id, name').eq('org_id', orgId),
    supabase.from('accounts').select('id, name').eq('org_id', orgId),
  ]);
  const person = names(peopleR.data);
  const client = names(clientsR.data);
  const project = names(projectsR.data);
  const account = names(accountsR.data);
  const of = (map: Map<string, string>, key: unknown) => (typeof key === 'string' ? (map.get(key) ?? '') : '');

  let header: string[] = [];
  let rows: CsvValue[][] = [];
  if (kind === 'expenses') {
    const result = await supabase.from('expenses').select('*').eq('org_id', orgId).gte('expense_date', from).lt('expense_date', until).order('expense_date');
    if (result.error) return fail(400, result.error.message);
    header = ['Date', 'Category', 'Description', 'Amount', 'Account', 'Traveller', 'From', 'To', 'Project', 'Client', 'Purpose', 'Entered by', 'Accepted by'];
    rows = (result.data as Record<string, unknown>[]).map((row) => [
      row.expense_date as string, row.category as string, row.description as string, row.amount as number, of(account, row.account_id),
      of(person, row.traveler_id), row.trip_origin as string, row.trip_destination as string, of(project, row.project_id),
      of(client, row.client_id), row.purpose as string, of(person, row.created_by), of(person, row.approved_by),
    ]);
  } else if (kind === 'payments') {
    const [result, invoicesR] = await Promise.all([
      supabase.from('payments').select('*').eq('org_id', orgId).gte('paid_on', from).lt('paid_on', until).order('paid_on'),
      supabase.from('invoices').select('id, invoice_number, client_id').eq('org_id', orgId),
    ]);
    if (result.error) return fail(400, result.error.message);
    const invoice = new Map(((invoicesR.data ?? []) as { id: string; invoice_number: string; client_id: string }[]).map((row) => [row.id, row]));
    header = ['Paid on', 'Invoice', 'Client', 'Amount', 'Account', 'Method', 'Note'];
    rows = (result.data as Record<string, unknown>[]).map((row) => {
      const inv = invoice.get(row.invoice_id as string);
      return [row.paid_on as string, inv?.invoice_number ?? '', of(client, inv?.client_id), row.amount as number, of(account, row.account_id), row.method as string, row.note as string];
    });
  } else if (kind === 'invoices') {
    const [result, balancesR] = await Promise.all([
      supabase.from('invoices').select('*').eq('org_id', orgId).gte('issue_date', from).lt('issue_date', until).order('issue_date'),
      supabase.from('invoice_balances').select('*').eq('org_id', orgId),
    ]);
    if (result.error) return fail(400, result.error.message);
    const balance = new Map(((balancesR.data ?? []) as { invoice_id: string; paid: number; outstanding: number }[]).map((row) => [row.invoice_id, row]));
    header = ['Invoice', 'Client', 'Project', 'Issued', 'Due', 'Amount', 'Paid', 'Outstanding', 'Status', 'Notes'];
    rows = (result.data as Record<string, unknown>[]).map((row) => [
      row.invoice_number as string, of(client, row.client_id), of(project, row.project_id), row.issue_date as string, row.due_date as string,
      row.amount as number, balance.get(row.id as string)?.paid ?? 0, balance.get(row.id as string)?.outstanding ?? row.amount as number, row.status as string, row.notes as string,
    ]);
  } else if (kind === 'points') {
    const result = await supabase.from('point_entries').select('*').eq('org_id', orgId).eq('period_month', from).order('created_at');
    if (result.error) return fail(400, result.error.message);
    header = ['Date', 'Employee', 'Points', 'Source', 'Reason', 'Given by'];
    rows = (result.data as Record<string, unknown>[]).map((row) => [
      String(row.created_at).slice(0, 10), of(person, row.employee_id), row.points as number, row.source as string, row.reason as string, of(person, row.created_by),
    ]);
  } else {
    const result = await supabase.from('attendance').select('*').eq('org_id', orgId).gte('work_date', from).lt('work_date', until).order('work_date');
    if (result.error) return fail(400, result.error.message);
    header = ['Date', 'Employee', 'Status', 'Entry', 'Exit', 'Verified', 'Note'];
    rows = (result.data as Record<string, unknown>[]).map((row) => [
      row.work_date as string, of(person, row.employee_id), row.status as string, row.check_in as string, row.check_out as string,
      row.verified_at ? 'Yes' : 'No', row.note as string,
    ]);
  }

  return new Response(toCsv(header, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${kind}-${month}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

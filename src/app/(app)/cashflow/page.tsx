import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { dateInZone, monthStart, nextMonth, parseMonth } from '@/lib/domain/points';
import { label, money, monthLabel } from '@/lib/format';
import { asRows, enumOptions, getPageContext, options, rowsOf } from '@/lib/page';
import { getOrgTimezone } from '@/lib/services/rewards';
import type {
  Account,
  AccountBalance,
  Client,
  Expense,
  FixedExpense,
  Invoice,
  InvoiceBalance,
  Payment,
  Project,
} from '@/types/database';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'income', label: 'Money in' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'accounts', label: 'Accounts & clients' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  equipment: 'Equipment purchases',
  fixed: 'Fixed monthly costs',
  transport: 'Transport',
};

// Entries are shown one month at a time, so each month starts with an empty
// list. Totals that span months (account balances, client dues) are always
// calculated from every entry, so they stay accurate.
export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
  const query = await searchParams;
  const { supabase, orgId, isAdmin, can } = await getPageContext();
  if (!can('cashflow')) redirect('/dashboard');

  const timeZone = await getOrgTimezone(supabase, orgId);
  const now = new Date();
  const currentMonth = monthStart(now, timeZone);
  const month = parseMonth(query.month) ?? currentMonth;
  const until = nextMonth(month);
  const today = dateInZone(now, timeZone);
  const tab: Tab = TABS.some((item) => item.key === query.tab) ? (query.tab as Tab) : 'overview';
  const monthName = monthLabel(month);
  const needsApproval = !isAdmin;

  const [accountsR, balancesR, invoicesR, invoiceBalancesR, paymentsR, expensesR, clientsR, projectsR, fixedR] =
    await Promise.all([
      supabase.from('accounts').select('*').eq('org_id', orgId).order('name'),
      supabase.from('account_balances').select('*').eq('org_id', orgId),
      supabase.from('invoices').select('*').eq('org_id', orgId).order('issue_date', { ascending: false }),
      supabase.from('invoice_balances').select('*').eq('org_id', orgId),
      supabase.from('payments').select('*').eq('org_id', orgId).gte('paid_on', month).lt('paid_on', until).order('paid_on', { ascending: false }),
      supabase.from('expenses').select('*').eq('org_id', orgId).gte('expense_date', month).lt('expense_date', until).order('expense_date', { ascending: false }),
      supabase.from('clients').select('*').eq('org_id', orgId).order('name'),
      supabase.from('projects').select('*').eq('org_id', orgId).order('name'),
      supabase.from('fixed_expenses').select('*').eq('org_id', orgId).order('name'),
    ]);
  const accounts = rowsOf<Account>(accountsR.data);
  const invoices = rowsOf<Invoice>(invoicesR.data);
  const payments = rowsOf<Payment>(paymentsR.data);
  const expenses = rowsOf<Expense>(expensesR.data);
  const clients = rowsOf<Client>(clientsR.data);
  const projects = rowsOf<Project>(projectsR.data);
  const fixed = rowsOf<FixedExpense>(fixedR.data);

  const balance = new Map(rowsOf<AccountBalance>(balancesR.data).map((row) => [row.account_id, Number(row.balance)]));
  const invoiceBalance = new Map(rowsOf<InvoiceBalance>(invoiceBalancesR.data).map((row) => [row.invoice_id, row]));
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const accountName = new Map(accounts.map((account) => [account.id, account.name]));
  const invoiceNumber = new Map(invoices.map((invoice) => [invoice.id, invoice.invoice_number]));

  const accountRows = accounts.map((account) => ({ ...account, balance: balance.get(account.id) ?? Number(account.opening_balance) }));
  const invoiceRows = invoices.map((invoice) => ({
    ...invoice,
    client_name: clientName.get(invoice.client_id) ?? '—',
    project_name: invoice.project_id ? (projectName.get(invoice.project_id) ?? '—') : null,
    paid: Number(invoiceBalance.get(invoice.id)?.paid ?? 0),
    outstanding: invoice.status === 'void' ? 0 : Number(invoiceBalance.get(invoice.id)?.outstanding ?? invoice.amount),
  }));
  const issuedThisMonth = invoiceRows.filter((invoice) => invoice.issue_date >= month && invoice.issue_date < until);
  const unpaidEarlier = invoiceRows.filter((invoice) => invoice.issue_date < month && invoice.outstanding > 0);
  const paymentRows = payments.map((payment) => ({
    ...payment,
    invoice_label: invoiceNumber.get(payment.invoice_id) ?? '—',
    account_name: accountName.get(payment.account_id) ?? '—',
  }));
  const expenseRows = expenses.map((expense) => ({
    ...expense,
    account_name: expense.account_id ? (accountName.get(expense.account_id) ?? '—') : null,
  }));

  // All-time figures.
  const funds = accountRows.reduce((total, account) => total + account.balance, 0);
  const dues = invoiceRows.reduce((total, invoice) => total + Math.max(0, invoice.outstanding), 0);
  // This month's figures.
  const moneyIn = payments.reduce((total, payment) => total + Number(payment.amount), 0);
  const moneyOut = expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
  const byCategory = Object.keys(CATEGORY_LABEL).map((category) => {
    const own = expenses.filter((expense) => expense.category === category);
    return { category, count: own.length, total: own.reduce((total, expense) => total + Number(expense.amount ?? 0), 0) };
  });

  // A month with nothing recorded in it shows a plain "No data found".
  const monthIsEmpty = payments.length === 0 && expenses.length === 0 && issuedThisMonth.length === 0;

  const accountOptions = options(accounts, (account) => account.name);
  const defaultDate = month === currentMonth ? today : month;
  const invoiceColumns = [
    { key: 'invoice_number', label: 'Invoice' },
    { key: 'client_name', label: 'Client' },
    { key: 'project_name', label: 'Project' },
    { key: 'issue_date', label: 'Issued' },
    { key: 'due_date', label: 'Due' },
    { key: 'status', label: 'Status', kind: 'label' as const },
    { key: 'amount', label: 'Amount', kind: 'money' as const },
    { key: 'paid', label: 'Paid', kind: 'money' as const },
    { key: 'outstanding', label: 'Outstanding', kind: 'money' as const },
  ];
  const invoiceFields: Field[] = [
    { name: 'invoice_number', label: 'Invoice number', required: true, placeholder: 'INV-001' },
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: options(clients, (client) => client.name) },
    { name: 'project_id', label: 'Project', type: 'select', options: options(projects, (project) => project.name) },
    { name: 'amount', label: 'Amount', type: 'number', required: true },
    { name: 'issue_date', label: 'Issue date', type: 'date', required: true, defaultValue: defaultDate },
    { name: 'due_date', label: 'Due date', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'draft', options: enumOptions(['draft', 'sent', 'void']) },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];
  const expenseFields: Field[] = [
    {
      name: 'category',
      label: 'Category',
      type: 'select',
      required: true,
      defaultValue: 'general',
      options: Object.entries(CATEGORY_LABEL).map(([value, text]) => ({ value, label: text })),
      hint: 'An equipment purchase is added to the inventory automatically.',
    },
    { name: 'description', label: 'Description', required: true, hint: 'For equipment, this becomes the item name.' },
    { name: 'amount', label: 'Amount', type: 'number', hint: 'May be left empty only for an equipment purchase.' },
    { name: 'expense_date', label: 'Date', type: 'date', required: true, defaultValue: defaultDate },
    { name: 'account_id', label: 'Paid from', type: 'select', options: accountOptions },
    { name: 'fixed_expense_id', label: 'Fixed monthly cost', type: 'select', options: options(fixed, (item) => item.name), hint: 'Only for the fixed category.' },
    { name: 'trip_origin', label: 'Trip from', hint: 'Transport only.' },
    { name: 'trip_destination', label: 'Trip to', hint: 'Transport only.' },
  ];

  const href = (next: Tab) => `/cashflow?tab=${next}&month=${month.slice(0, 7)}`;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Cash Flow &amp; Invoices</h1>
          <p className="muted">
            Showing entries for {monthName}
            {month === currentMonth ? ' (current month)' : ''}. Balances and client dues always count every month.
          </p>
        </div>
        <form className="month-picker" method="get">
          <input type="hidden" name="tab" value={tab} />
          <label className="field">
            <span>Month</span>
            <input type="month" name="month" defaultValue={month.slice(0, 7)} max={currentMonth.slice(0, 7)} />
          </label>
          <button type="submit">Show</button>
        </form>
      </div>

      <nav className="tabs" aria-label="Cash flow sections">
        {TABS.map((item) => (
          <Link key={item.key} href={href(item.key)} aria-current={tab === item.key ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === 'overview' && monthIsEmpty ? (
        <section className="panel">
          <p className="muted empty">No data found for {monthName}.</p>
        </section>
      ) : null}

      {tab === 'overview' && !monthIsEmpty ? (
        <>
          <div className="cards">
            <div className="card">
              <span className="value">{money(funds)}</span>
              <span className="caption">Available funds, all accounts</span>
            </div>
            <div className="card">
              <span className="value">{money(dues)}</span>
              <span className="caption">Client dues outstanding</span>
            </div>
            <div className="card">
              <span className="value">{money(moneyIn)}</span>
              <span className="caption">Money in, {monthName}</span>
            </div>
            <div className="card">
              <span className="value">{money(moneyOut)}</span>
              <span className="caption">Money out, {monthName}</span>
            </div>
            <div className="card">
              <span className="value">{money(moneyIn - moneyOut)}</span>
              <span className="caption">Net for {monthName}</span>
            </div>
          </div>

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Expenses by category</h2>
                <p className="muted">{monthName}</p>
              </div>
              <Link href={href('expenses')}>See all expenses</Link>
            </header>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="num">Entries</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {byCategory.map((row) => (
                    <tr key={row.category}>
                      <td>{CATEGORY_LABEL[row.category]}</td>
                      <td className="num">{row.count}</td>
                      <td className="num">{money(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>Accounts</h2>
                <p className="muted">Current balance of each account.</p>
              </div>
              <Link href={href('accounts')}>Manage accounts</Link>
            </header>
            {accountRows.length === 0 ? (
              <p className="muted empty">No accounts yet. Add one under Accounts &amp; clients to start recording payments.</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Type</th>
                      <th className="num">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accountRows.map((account) => (
                      <tr key={account.id}>
                        <td>{account.name}</td>
                        <td>{label(account.kind)}</td>
                        <td className="num">{money(account.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === 'income' ? (
        <>
          <ResourceManager
            title={`Payments received in ${monthName}`}
            description={`Total: ${money(moneyIn)}.`}
            endpoint="/api/payments"
            rows={asRows(paymentRows)}
            columns={[
              { key: 'paid_on', label: 'Date' },
              { key: 'invoice_label', label: 'Invoice' },
              { key: 'account_name', label: 'Into account' },
              { key: 'method', label: 'Method' },
              { key: 'amount', label: 'Amount', kind: 'money' },
              { key: 'note', label: 'Note' },
            ]}
            fields={[
              { name: 'invoice_id', label: 'Invoice', type: 'select', required: true, options: options(invoices, (invoice) => invoice.invoice_number) },
              { name: 'account_id', label: 'Into account', type: 'select', required: true, options: accountOptions },
              { name: 'amount', label: 'Amount', type: 'number', required: true },
              { name: 'paid_on', label: 'Date', type: 'date', required: true, defaultValue: defaultDate },
              { name: 'method', label: 'Method', placeholder: 'Bank transfer, bKash, cash…' },
              { name: 'note', label: 'Note', type: 'textarea' },
            ]}
            canWrite
            needsApproval={needsApproval}
            addLabel="Record payment"
            emptyText="No data found."
          />

          <ResourceManager
            title={`Invoices issued in ${monthName}`}
            endpoint="/api/invoices"
            rows={asRows(issuedThisMonth)}
            columns={invoiceColumns}
            fields={invoiceFields}
            canWrite
            needsApproval={needsApproval}
            addLabel="Add invoice"
            emptyText={clients.length === 0 ? 'Add a client under Accounts & clients before invoicing.' : 'No data found.'}
          />

          <ResourceManager
            title="Still unpaid from earlier months"
            description="Carried over until they are paid or voided."
            endpoint="/api/invoices"
            rows={asRows(unpaidEarlier)}
            columns={invoiceColumns}
            editFields={invoiceFields}
            canWrite
            needsApproval={needsApproval}
            emptyText="Nothing outstanding from earlier months."
          />
        </>
      ) : null}

      {tab === 'expenses' ? (
        <>
          <div className="cards" hidden={expenses.length === 0}>
            {byCategory.map((row) => (
              <div key={row.category} className="card">
                <span className="value">{money(row.total)}</span>
                <span className="caption">
                  {CATEGORY_LABEL[row.category]} · {row.count} {row.count === 1 ? 'entry' : 'entries'}
                </span>
              </div>
            ))}
          </div>

          <ResourceManager
            title={`Expenses in ${monthName}`}
            description={`Total: ${money(moneyOut)}. Use the search box to find an entry by description, category or account.`}
            endpoint="/api/expenses"
            rows={asRows(expenseRows)}
            columns={[
              { key: 'expense_date', label: 'Date' },
              { key: 'category', label: 'Category', kind: 'label' },
              { key: 'description', label: 'Description' },
              { key: 'account_name', label: 'Paid from' },
              { key: 'amount', label: 'Amount', kind: 'money' },
            ]}
            fields={expenseFields}
            canWrite
            needsApproval={needsApproval}
            addLabel="Add expense"
            emptyText="No data found."
          />
        </>
      ) : null}

      {tab === 'accounts' ? (
        <>
          <ResourceManager
            title="Accounts"
            description="Balance = opening balance + payments received − expenses paid, across all months."
            endpoint="/api/accounts"
            rows={asRows(accountRows)}
            columns={[
              { key: 'name', label: 'Account' },
              { key: 'kind', label: 'Type', kind: 'label' },
              { key: 'opening_balance', label: 'Opening', kind: 'money' },
              { key: 'balance', label: 'Balance', kind: 'money' },
            ]}
            fields={[
              { name: 'name', label: 'Name', required: true, placeholder: 'Cash in hand' },
              { name: 'kind', label: 'Type', type: 'select', required: true, defaultValue: 'cash', options: enumOptions(['cash', 'bank', 'mobile_wallet']) },
              { name: 'opening_balance', label: 'Opening balance', type: 'number', required: true, defaultValue: '0' },
            ]}
            canWrite
            needsApproval={needsApproval}
            addLabel="Add account"
            emptyText="No accounts yet. Add one to start recording payments."
          />

          <ResourceManager
            title="Clients"
            description="Who you invoice. A client is also added automatically when you type a new client name on a project."
            endpoint="/api/clients"
            rows={asRows(clients)}
            columns={[
              { key: 'name', label: 'Client' },
              { key: 'contact_name', label: 'Contact' },
              { key: 'email', label: 'Email' },
              { key: 'phone', label: 'Phone' },
            ]}
            fields={[
              { name: 'name', label: 'Client name', required: true },
              { name: 'contact_name', label: 'Contact person' },
              { name: 'email', label: 'Email', type: 'email' },
              { name: 'phone', label: 'Phone' },
              { name: 'notes', label: 'Notes', type: 'textarea' },
            ]}
            canWrite
            needsApproval={needsApproval}
            addLabel="Add client"
            emptyText="No clients yet."
          />
        </>
      ) : null}
    </>
  );
}

import { Download } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MonthPicker } from '@/components/month-picker';
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
  { key: 'investments', label: 'Investments' },
  { key: 'accounts', label: 'Accounts & clients' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// A colour per expense category, used for the small dots beside their names.
const CATEGORY_COLOR: Record<string, string> = {
  general: 'slate',
  equipment: 'blue',
  fixed: 'amber',
  transport: 'purple',
  investment: 'teal',
  salary: 'orange',
};

const CATEGORY_LABEL: Record<string, string> = {
  general: 'General',
  equipment: 'Equipment purchases',
  fixed: 'Fixed monthly costs',
  transport: 'Transport',
  investment: 'Investment repayment',
  salary: 'Salaries',
};

// Entries are shown one month at a time, so each month starts with an empty
// list. Totals that span months (account balances, client dues) are always
// calculated from every entry, so they stay accurate.
export default async function CashFlowPage({ searchParams }: { searchParams: Promise<{ month?: string; tab?: string }> }) {
  const query = await searchParams;
  const { supabase, orgId, isAdmin, can, canEdit } = await getPageContext();
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
  // A role may be allowed to view cash flow without being allowed to change it.
  const editsCashflow = canEdit('cashflow');

  const [accountsR, balancesR, invoicesR, invoiceBalancesR, paymentsR, expensesR, clientsR, projectsR, fixedR, peopleR, investorsR, investorBalancesR, investmentsR] =
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
      supabase.from('profiles').select('id, full_name').eq('org_id', orgId),
      // Investors, what the company owes each, and every investment received (balances count all of them).
      supabase.from('investors').select('*').eq('org_id', orgId).order('name'),
      supabase.from('investor_balances').select('*').eq('org_id', orgId),
      supabase.from('investments').select('*').eq('org_id', orgId).order('received_on', { ascending: false }),
    ]);
  const investorsReady = !investorsR.error;
  const investors = rowsOf<{ id: string; name: string; phone: string | null; notes: string | null }>(investorsR.data);
  const investorDue = new Map(
    rowsOf<{ investor_id: string; invested: number; repaid: number; due: number }>(investorBalancesR.data).map((row) => [row.investor_id, row]),
  );
  const investments = rowsOf<{ id: string; investor_id: string; account_id: string; amount: number; received_on: string; note: string | null }>(investmentsR.data);
  const investorName = new Map(investors.map((investor) => [investor.id, investor.name]));
  const investorRows = investors.map((investor) => ({
    ...investor,
    invested: Number(investorDue.get(investor.id)?.invested ?? 0),
    repaid: Number(investorDue.get(investor.id)?.repaid ?? 0),
    due: Number(investorDue.get(investor.id)?.due ?? 0),
  }));
  const owedToInvestors = investorRows.reduce((total, row) => total + Math.max(0, row.due), 0);
  const investedThisMonth = investments
    .filter((row) => row.received_on >= month && row.received_on < until)
    .reduce((total, row) => total + Number(row.amount), 0);
  const personName = new Map(rowsOf<{ id: string; full_name: string }>(peopleR.data).map((person) => [person.id, person.full_name]));
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
    // Opens the invoice to print, save as PDF or share with the client.
    invoice_href: `/invoices/${invoice.id}`,
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
    // A repayment shows who was paid back.
    description: (() => {
      const investor = (expense as unknown as { investor_id?: string | null }).investor_id;
      return investor && investorName.get(investor) ? `${expense.description} · to ${investorName.get(investor)}` : expense.description;
    })(),
    account_name: expense.account_id ? (accountName.get(expense.account_id) ?? '—') : null,
    // Who recorded it, and (when it came from someone else's request) the admin who approved it.
    entered_by: expense.created_by ? (personName.get(expense.created_by) ?? '—') : '—',
    approved_by_name: expense.approved_by ? (personName.get(expense.approved_by) ?? '—') : null,
  }));

  // All-time figures.
  const funds = accountRows.reduce((total, account) => total + account.balance, 0);
  const dues = invoiceRows.reduce((total, invoice) => total + Math.max(0, invoice.outstanding), 0);
  // This month's figures.
  // Cash that came in: client payments plus investments received.
  const moneyIn = payments.reduce((total, payment) => total + Number(payment.amount), 0) + investedThisMonth;
  const moneyOut = expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
  const byCategory = Object.keys(CATEGORY_LABEL).map((category) => {
    const own = expenses.filter((expense) => expense.category === category);
    return { category, count: own.length, total: own.reduce((total, expense) => total + Number(expense.amount ?? 0), 0) };
  });

  // A month with nothing recorded in it shows a plain "No data found".
  const monthIsEmpty = payments.length === 0 && expenses.length === 0 && issuedThisMonth.length === 0 && investedThisMonth === 0;

  const accountOptions = options(accounts, (account) => account.name);
  const defaultDate = month === currentMonth ? today : month;
  const invoiceColumns = [
    { key: 'invoice_number', label: 'Invoice', kind: 'nav' as const, hrefKey: 'invoice_href' },
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
      hint: 'An equipment purchase is added to the inventory automatically. Investment repayment pays an investor back.',
    },
    ...(investorsReady
      ? [
          {
            name: 'investor_id',
            label: 'Paid back to (investor)',
            type: 'select' as const,
            options: options(investors, (investor) => investor.name),
            hint: 'Only for Investment repayment: lowers what the company owes this investor.',
          },
        ]
      : []),
    { name: 'description', label: 'Description', required: true, hint: 'For equipment, this becomes the item name.' },
    { name: 'amount', label: 'Amount', type: 'number', hint: 'May be left empty only for an equipment purchase.' },
    { name: 'expense_date', label: 'Date', type: 'date', required: true, defaultValue: defaultDate },
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
        <div className="header-tools">
          <MonthPicker value={month.slice(0, 7)} current={currentMonth.slice(0, 7)} keep={{ tab }} />
          <details className="export-menu">
            <summary className="button">
              <Download size={14} aria-hidden />
              Export
            </summary>
            <div>
              {(['expenses', 'payments', 'invoices'] as const).map((kind) => (
                <a key={kind} href={`/api/export?type=${kind}&month=${month.slice(0, 7)}`} download>
                  {kind === 'expenses' ? 'Costs' : kind === 'payments' ? 'Payments received' : 'Invoices issued'} (CSV)
                </a>
              ))}
              <Link href={`/report?month=${month.slice(0, 7)}`}>Monthly summary (print / PDF)</Link>
              <Link href={`/kpi?month=${month.slice(0, 7)}`}>KPIs</Link>
            </div>
          </details>
        </div>
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
            {/* What the company can actually use: never below zero; a shortfall is noted instead. */}
            <div className="card tone-green">
              <span className="value">{money(Math.max(0, funds))}</span>
              <span className="caption">Available funds, all accounts</span>
              {funds < 0 ? <span className="caption text-danger-strong">Short by {money(-funds)}</span> : null}
            </div>
            <div className={dues > 0 ? 'card tone-yellow' : 'card'}>
              <span className="value">{money(dues)}</span>
              <span className="caption">Client dues outstanding</span>
            </div>
            {owedToInvestors > 0 ? (
              <Link href={href('investments')} className="card tone-yellow">
                <span className="value">{money(owedToInvestors)}</span>
                <span className="caption">Company due to investors</span>
              </Link>
            ) : null}
            <div className={moneyIn > 0 ? 'card tone-green' : 'card'}>
              <span className="value">{money(moneyIn)}</span>
              <span className="caption">
                Money in, {monthName}
                {investedThisMonth > 0 ? ` (incl. ${money(investedThisMonth)} investment)` : ''}
              </span>
            </div>
            <div className={moneyOut > 0 ? 'card tone-red' : 'card'}>
              <span className="value">{money(moneyOut)}</span>
              <span className="caption">Money out, {monthName}</span>
            </div>
            <div className={moneyIn - moneyOut >= 0 ? 'card tone-green' : 'card tone-red'}>
              <span className="value">
                {moneyIn - moneyOut < 0 ? '−' : ''}
                {money(Math.abs(moneyIn - moneyOut))}
              </span>
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
                      <td>
                        <span className={`dot tag-${CATEGORY_COLOR[row.category]}`} aria-hidden />
                        {CATEGORY_LABEL[row.category]}
                      </td>
                      <td className="num">{row.count}</td>
                      <td className={row.total > 0 ? 'num amount-out' : 'num muted'}>{money(row.total)}</td>
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
                        <td className={account.balance < 0 ? 'num amount-out' : 'num amount-in'}>{money(account.balance)}</td>
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
            canWrite={editsCashflow}
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
            canWrite={editsCashflow}
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
            canWrite={editsCashflow}
            needsApproval={needsApproval}
            emptyText="Nothing outstanding from earlier months."
          />
        </>
      ) : null}

      {tab === 'expenses' ? (
        <>
          <div className="cards" hidden={expenses.length === 0}>
            {byCategory.map((row) => (
              <div key={row.category} className={row.total > 0 ? 'card tone-red' : 'card'}>
                <span className="value">{money(row.total)}</span>
                <span className="caption">
                  <span className={`dot tag-${CATEGORY_COLOR[row.category]}`} aria-hidden />
                  {CATEGORY_LABEL[row.category]} · {row.count} {row.count === 1 ? 'entry' : 'entries'}
                </span>
              </div>
            ))}
          </div>

          <ResourceManager
            title={`Expenses in ${monthName}`}
            description={`Total: ${money(moneyOut)}. Entered by shows who recorded each one; Approved by shows who accepted it when it came from someone else. Expenses are taken from the main account.`}
            endpoint="/api/expenses"
            rows={asRows(expenseRows)}
            columns={[
              { key: 'expense_date', label: 'Date' },
              { key: 'category', label: 'Category', kind: 'label' },
              { key: 'description', label: 'Description' },
              { key: 'entered_by', label: 'Entered by' },
              { key: 'approved_by_name', label: 'Approved by' },
              { key: 'amount', label: 'Amount', kind: 'money' },
            ]}
            fields={expenseFields}
            canWrite={editsCashflow}
            needsApproval={needsApproval}
            addLabel="Add expense"
            emptyText="No data found."
          />
        </>
      ) : null}

      {tab === 'investments' ? (
        investorsReady ? (
          <>
            <div className="cards">
              <div className="card tone-green">
                <span className="value">{money(investorRows.reduce((total, row) => total + row.invested, 0))}</span>
                <span className="caption">Invested in total</span>
              </div>
              <div className="card">
                <span className="value">{money(investorRows.reduce((total, row) => total + row.repaid, 0))}</span>
                <span className="caption">Paid back</span>
              </div>
              <div className={owedToInvestors > 0 ? 'card tone-yellow' : 'card'}>
                <span className="value">{money(owedToInvestors)}</span>
                <span className="caption">Company due to investors</span>
              </div>
            </div>

            <ResourceManager
              title="Investors"
              description="Record money an investor put in: it goes into the account you choose, so the funds go up, and the company owes them the same amount. Type an existing name to add more from the same investor. To pay one back, add an expense with the category Investment repayment and choose them."
              endpoint="/api/investors"
              rows={asRows(
                investorRows.map((row) => ({
                  ...row,
                  history: investments
                    .filter((item) => item.investor_id === row.id)
                    .map((item) => `${money(Number(item.amount))} on ${item.received_on} into ${accountName.get(item.account_id) ?? '—'}`)
                    .join(' · '),
                })),
              )}
              columns={[
                { key: 'name', label: 'Investor' },
                { key: 'invested', label: 'Invested', kind: 'money' },
                { key: 'repaid', label: 'Paid back', kind: 'money' },
                { key: 'due', label: 'Company due', kind: 'money' },
                { key: 'history', label: 'Received' },
                { key: 'phone', label: 'Phone' },
              ]}
              fields={[
                { name: 'name', label: 'Investor', required: true, hint: 'A new name adds the investor.' },
                { name: 'amount', label: 'Amount invested', type: 'number', required: true },
                { name: 'account_id', label: 'Into account', type: 'select', required: true, options: options(accounts, (account) => account.name) },
                { name: 'received_on', label: 'Date', type: 'date', required: true, defaultValue: defaultDate },
                { name: 'phone', label: 'Phone' },
                { name: 'note', label: 'Note' },
              ]}
              editFields={[
                { name: 'name', label: 'Investor', required: true },
                { name: 'phone', label: 'Phone' },
                { name: 'notes', label: 'Notes', type: 'textarea' },
              ]}
              canWrite={editsCashflow}
              needsApproval={needsApproval}
              addLabel="Record an investment"
              emptyText="No investments recorded yet."
            />
          </>
        ) : (
          <section className="panel">
            <p className="muted">Investments arrive with the next database update. Reload this page in a minute.</p>
          </section>
        )
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
            canWrite={editsCashflow}
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
            canWrite={editsCashflow}
            needsApproval={needsApproval}
            addLabel="Add client"
            emptyText="No clients yet."
          />
        </>
      ) : null}
    </>
  );
}

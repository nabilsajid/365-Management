import { redirect } from 'next/navigation';
import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { money } from '@/lib/format';
import { dateInZone } from '@/lib/domain/points';
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

export default async function CashFlowPage() {
  const { supabase, orgId, isAdmin } = await getPageContext();
  if (!isAdmin) redirect('/projects');

  const [accountsR, balancesR, invoicesR, invoiceBalancesR, paymentsR, expensesR, clientsR, projectsR, fixedR, timeZone] =
    await Promise.all([
      supabase.from('accounts').select('*').eq('org_id', orgId).order('name'),
      supabase.from('account_balances').select('*').eq('org_id', orgId),
      supabase.from('invoices').select('*').eq('org_id', orgId).order('issue_date', { ascending: false }),
      supabase.from('invoice_balances').select('*').eq('org_id', orgId),
      supabase.from('payments').select('*').eq('org_id', orgId).order('paid_on', { ascending: false }),
      supabase.from('expenses').select('*').eq('org_id', orgId).order('expense_date', { ascending: false }),
      supabase.from('clients').select('*').eq('org_id', orgId).order('name'),
      supabase.from('projects').select('*').eq('org_id', orgId).order('name'),
      supabase.from('fixed_expenses').select('*').eq('org_id', orgId).order('name'),
      getOrgTimezone(supabase, orgId),
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
  const today = dateInZone(new Date(), timeZone);

  const accountRows = accounts.map((account) => ({ ...account, balance: balance.get(account.id) ?? Number(account.opening_balance) }));
  const invoiceRows = invoices.map((invoice) => ({
    ...invoice,
    client_name: clientName.get(invoice.client_id) ?? '—',
    project_name: invoice.project_id ? (projectName.get(invoice.project_id) ?? '—') : null,
    paid: Number(invoiceBalance.get(invoice.id)?.paid ?? 0),
    outstanding: invoice.status === 'void' ? 0 : Number(invoiceBalance.get(invoice.id)?.outstanding ?? invoice.amount),
  }));
  const paymentRows = payments.map((payment) => ({
    ...payment,
    invoice_label: invoiceNumber.get(payment.invoice_id) ?? '—',
    account_name: accountName.get(payment.account_id) ?? '—',
  }));
  const expenseRows = expenses.map((expense) => ({
    ...expense,
    account_name: expense.account_id ? (accountName.get(expense.account_id) ?? '—') : null,
  }));

  const funds = accountRows.reduce((total, account) => total + account.balance, 0);
  const dues = invoiceRows.reduce((total, invoice) => total + Math.max(0, invoice.outstanding), 0);

  const accountOptions = options(accounts, (account) => account.name);
  const invoiceFields: Field[] = [
    { name: 'invoice_number', label: 'Invoice number', required: true, placeholder: 'INV-001' },
    { name: 'client_id', label: 'Client', type: 'select', required: true, options: options(clients, (client) => client.name) },
    { name: 'project_id', label: 'Project', type: 'select', options: options(projects, (project) => project.name) },
    { name: 'amount', label: 'Amount', type: 'number', required: true },
    { name: 'issue_date', label: 'Issue date', type: 'date', required: true, defaultValue: today },
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
      options: [
        { value: 'general', label: 'General' },
        { value: 'equipment', label: 'Equipment purchase' },
        { value: 'fixed', label: 'Fixed monthly cost' },
        { value: 'transport', label: 'Transport' },
      ],
      hint: 'An equipment purchase is added to the inventory automatically.',
    },
    { name: 'description', label: 'Description', required: true, hint: 'For equipment, this becomes the item name.' },
    { name: 'amount', label: 'Amount', type: 'number', hint: 'May be left empty only for an equipment purchase.' },
    { name: 'expense_date', label: 'Date', type: 'date', required: true, defaultValue: today },
    { name: 'account_id', label: 'Paid from', type: 'select', options: accountOptions },
    { name: 'fixed_expense_id', label: 'Fixed monthly cost', type: 'select', options: options(fixed, (item) => item.name), hint: 'Only for the fixed category.' },
    { name: 'trip_origin', label: 'Trip from', hint: 'Transport only.' },
    { name: 'trip_destination', label: 'Trip to', hint: 'Transport only.' },
  ];

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Cash Flow &amp; Invoices</h1>
          <p className="muted">Invoices, payments, expenses and account balances.</p>
        </div>
      </div>

      <div className="cards">
        <div className="card">
          <span className="value">{money(funds)}</span>
          <span className="caption">Company funds across all accounts</span>
        </div>
        <div className="card">
          <span className="value">{money(dues)}</span>
          <span className="caption">Outstanding client dues</span>
        </div>
      </div>

      <ResourceManager
        title="Accounts"
        description="Balance = opening balance + payments received − expenses paid."
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
        addLabel="Add account"
        emptyText="No accounts yet. Add one to start recording payments."
      />

      <ResourceManager
        title="Invoices"
        endpoint="/api/invoices"
        rows={asRows(invoiceRows)}
        columns={[
          { key: 'invoice_number', label: 'Invoice' },
          { key: 'client_name', label: 'Client' },
          { key: 'project_name', label: 'Project' },
          { key: 'issue_date', label: 'Issued' },
          { key: 'due_date', label: 'Due' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'amount', label: 'Amount', kind: 'money' },
          { key: 'paid', label: 'Paid', kind: 'money' },
          { key: 'outstanding', label: 'Outstanding', kind: 'money' },
        ]}
        fields={invoiceFields}
        canWrite
        addLabel="Add invoice"
        emptyText={clients.length === 0 ? 'Add a client under Projects & Clients before invoicing.' : 'No invoices yet.'}
      />

      <ResourceManager
        title="Payments received"
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
          { name: 'paid_on', label: 'Date', type: 'date', required: true, defaultValue: today },
          { name: 'method', label: 'Method', placeholder: 'Bank transfer, bKash, cash…' },
          { name: 'note', label: 'Note', type: 'textarea' },
        ]}
        canWrite
        addLabel="Record payment"
        emptyText="No payments recorded yet."
      />

      <ResourceManager
        title="Expenses"
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
        addLabel="Add expense"
        emptyText="No expenses recorded yet."
      />
    </>
  );
}

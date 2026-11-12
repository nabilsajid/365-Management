import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { money } from '@/lib/format';
import { asRows, enumOptions, getPageContext, options, peopleOptions, rowsOf } from '@/lib/page';
import type { Account, Equipment, Expense, FixedExpense, Profile } from '@/types/database';

export default async function LogisticsPage() {
  const { supabase, orgId, isAdmin } = await getPageContext();

  // Cost tables are admin-only; row level security returns nothing for employees.
  const [equipmentResult, peopleResult, fixedResult, tripsResult, accountsResult] = await Promise.all([
    supabase.from('equipment').select('*').eq('org_id', orgId).order('name'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('fixed_expenses').select('*').eq('org_id', orgId).order('name'),
    supabase.from('expenses').select('*').eq('org_id', orgId).eq('category', 'transport').order('expense_date', { ascending: false }),
    supabase.from('accounts').select('*').eq('org_id', orgId).order('name'),
  ]);
  const equipment = rowsOf<Equipment>(equipmentResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const fixed = rowsOf<FixedExpense>(fixedResult.data);
  const trips = rowsOf<Expense>(tripsResult.data);
  const accounts = rowsOf<Account>(accountsResult.data);
  const person = new Map(people.map((profile) => [profile.id, profile]));
  const staff = peopleOptions(people);

  const equipmentRows = equipment.map((item) => {
    const holder = item.current_holder_id ? person.get(item.current_holder_id) : undefined;
    return {
      ...item,
      holder_name: holder?.full_name ?? 'In storage',
      holder_role: holder?.job_title ?? null,
      held_since: item.holder_since ? item.holder_since.slice(0, 10) : null,
      origin: item.source_expense_id ? 'Cash flow purchase' : 'Registered manually',
    };
  });
  const tripRows = trips.map((trip) => ({
    ...trip,
    traveler_name: trip.traveler_id ? (person.get(trip.traveler_id)?.full_name ?? '—') : null,
  }));

  const equipmentFields: Field[] = [
    { name: 'name', label: 'Name', required: true },
    { name: 'category', label: 'Category', placeholder: 'Camera, lens, audio…' },
    { name: 'serial_number', label: 'Serial number' },
    { name: 'purchase_price', label: 'Purchase price', type: 'number', hint: 'Optional. Leave empty if unknown.' },
    { name: 'purchase_date', label: 'Purchase date', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'available', options: enumOptions(['available', 'in_use', 'maintenance', 'retired']) },
    { name: 'current_holder_id', label: 'Currently held by', type: 'select', options: staff },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const fixedTotal = fixed.filter((item) => item.is_active).reduce((total, item) => total + Number(item.monthly_amount), 0);
  const assetValue = equipment
    .filter((item) => item.status !== 'retired')
    .reduce((total, item) => total + Number(item.purchase_price ?? 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Logistics &amp; Costs</h1>
          <p className="muted">Equipment, who holds it, and the running costs of the studio.</p>
        </div>
      </div>

      <ResourceManager
        title="Equipment"
        description={`Tracked on its own, not tied to projects. Known asset value: ${money(assetValue)}.`}
        endpoint="/api/equipment"
        rows={asRows(equipmentRows)}
        columns={[
          { key: 'name', label: 'Item' },
          { key: 'category', label: 'Category' },
          { key: 'serial_number', label: 'Serial' },
          { key: 'purchase_price', label: 'Price', kind: 'money' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'holder_name', label: 'Held by' },
          { key: 'holder_role', label: 'Role' },
          { key: 'held_since', label: 'Since' },
          { key: 'origin', label: 'Source' },
        ]}
        fields={equipmentFields}
        canWrite={isAdmin}
        addLabel="Register equipment"
        emptyText="No equipment registered yet."
      />

      {isAdmin ? (
        <>
          <ResourceManager
            title="Fixed monthly expenses"
            description={`Active total: ${money(fixedTotal)} per month.`}
            endpoint="/api/fixed-expenses"
            rows={asRows(fixed)}
            columns={[
              { key: 'name', label: 'Expense' },
              { key: 'kind', label: 'Type', kind: 'label' },
              { key: 'monthly_amount', label: 'Per month', kind: 'money' },
              { key: 'is_active', label: 'Active', kind: 'bool' },
            ]}
            fields={[
              { name: 'name', label: 'Name', required: true, placeholder: 'Office rent' },
              { name: 'kind', label: 'Type', type: 'select', required: true, defaultValue: 'other', options: enumOptions(['rent', 'utilities', 'other']) },
              { name: 'monthly_amount', label: 'Monthly amount', type: 'number', required: true },
              { name: 'is_active', label: 'Active', type: 'checkbox' },
            ]}
            canWrite
            addLabel="Add fixed expense"
            emptyText="No fixed expenses yet."
          />

          <ResourceManager
            title="Transport expenses"
            description="One entry per trip. These also appear under expenses in Cash Flow."
            endpoint="/api/expenses"
            rows={asRows(tripRows)}
            columns={[
              { key: 'expense_date', label: 'Date' },
              { key: 'description', label: 'Purpose' },
              { key: 'trip_origin', label: 'From' },
              { key: 'trip_destination', label: 'To' },
              { key: 'traveler_name', label: 'Traveller' },
              { key: 'amount', label: 'Cost', kind: 'money' },
            ]}
            fields={[
              { name: 'description', label: 'Purpose', required: true, placeholder: 'Client shoot' },
              { name: 'expense_date', label: 'Date', type: 'date', required: true },
              { name: 'trip_origin', label: 'From', required: true },
              { name: 'trip_destination', label: 'To', required: true },
              { name: 'amount', label: 'Cost', type: 'number', required: true },
              { name: 'traveler_id', label: 'Traveller', type: 'select', options: staff },
              { name: 'account_id', label: 'Paid from', type: 'select', options: options(accounts, (account) => account.name) },
            ]}
            fixedValues={{ category: 'transport' }}
            canWrite
            addLabel="Add trip"
            emptyText="No trips recorded yet."
          />
        </>
      ) : null}
    </>
  );
}

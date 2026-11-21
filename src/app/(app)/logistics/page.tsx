import Link from 'next/link';
import { CheckoutList, type CheckoutRow } from '@/components/checkout-list';
import { ApiForm, ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { money } from '@/lib/format';
import { asRows, enumOptions, getPageContext, options, peopleOptions, rowsOf } from '@/lib/page';
import type { Client, Equipment, EquipmentNeed, Expense, FixedExpense, Profile, Project } from '@/types/database';

const TABS = [
  { key: 'equipment', label: 'Equipment' },
  { key: 'checkouts', label: 'Checkouts' },
  { key: 'needs', label: 'Needed items' },
  { key: 'fixed', label: 'Fixed costs' },
  { key: 'travel', label: 'Travel costs' },
] as const;
type Tab = (typeof TABS)[number]['key'];

const DAY = 86_400_000;
const daysBetween = (from: string, to: string) => Math.max(0, Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY));

export default async function LogisticsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const requestedTab = (await searchParams).tab;
  const { supabase, orgId, userId, isAdmin, can, canEdit, localDate } = await getPageContext();
  const today = localDate(new Date().toISOString());
  const seesInventory = can('equipment');
  const seesCosts = can('costs');
  // Viewing a part and changing it are separate: these say what this person may change.
  const editsInventory = canEdit('equipment');
  const editsCosts = canEdit('costs');
  // Admins change things directly; other roles with access propose changes for approval.
  const needsApproval = !isAdmin;

  // Row level security narrows every query to what the viewer's roles allow:
  // without the equipment segment only the items they hold come back, and
  // without the costs segment the cost tables come back empty.
  const [equipmentResult, peopleResult, fixedResult, tripsResult, needsResult, projectsResult, clientsResult, purposeProbe, checkoutsResult, accountsResult] = await Promise.all([
    supabase.from('equipment').select('*').eq('org_id', orgId).order('name'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('fixed_expenses').select('*').eq('org_id', orgId).order('name'),
    supabase.from('expenses').select('*').eq('org_id', orgId).eq('category', 'transport').order('expense_date', { ascending: false }),
    supabase.from('equipment_needs').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name, status').eq('org_id', orgId).order('name'),
    supabase.from('clients').select('id, name').eq('org_id', orgId).order('name'),
    // The trip purpose columns arrive with a database update; until then the form leaves them out.
    supabase.from('expenses').select('project_id').limit(1),
    // Who took which item, for how long (after the checkouts database update).
    supabase.from('equipment_checkouts').select('*').eq('org_id', orgId).order('created_at', { ascending: false }).limit(300),
    supabase.from('accounts').select('id, name').eq('org_id', orgId).order('name'),
  ]);
  const accountOptions = rowsOf<{ id: string; name: string }>(accountsResult.data).map((row) => ({ value: row.id, label: row.name }));
  // Fixed costs can be recorded in Cash Flow each month by themselves (after the database update).
  const autoReady = ((fixedResult.data ?? []) as Record<string, unknown>[]).every((row) => 'auto_record' in row);
  const checkoutsReady = !checkoutsResult.error;
  // Sections: everyone sees equipment, checkouts and needed items; costs need the costs role.
  const tabs = TABS.filter((item) => (item.key === 'fixed' || item.key === 'travel' ? seesCosts : item.key !== 'checkouts' || checkoutsReady));
  const tab: Tab = tabs.some((item) => item.key === requestedTab) ? (requestedTab as Tab) : 'equipment';
  const projects = rowsOf<Pick<Project, 'id' | 'name' | 'status'>>(projectsResult.data);
  const clients = rowsOf<Pick<Client, 'id' | 'name'>>(clientsResult.data);
  const hasTripPurpose = !purposeProbe.error;
  const projectName = new Map(projects.map((project) => [project.id, project.name]));
  const clientName = new Map(clients.map((client) => [client.id, client.name]));
  const equipment = rowsOf<Equipment>(equipmentResult.data);
  const people = rowsOf<Profile>(peopleResult.data);
  const fixed = rowsOf<FixedExpense>(fixedResult.data);
  const trips = rowsOf<Expense>(tripsResult.data);
  const needs = rowsOf<EquipmentNeed>(needsResult.data);
  const person = new Map(people.map((profile) => [profile.id, profile]));
  const staff = peopleOptions(people);
  const itemName = new Map(equipment.map((item) => [item.id, item.name]));
  const checkouts: CheckoutRow[] = rowsOf<{
    id: string;
    equipment_id: string;
    holder_id: string;
    requested_by: string | null;
    status: CheckoutRow['status'];
    purpose: string | null;
    project_id: string | null;
    start_date: string;
    due_back: string | null;
    taken_at: string | null;
    returned_at: string | null;
    decided_by: string | null;
    note: string | null;
    created_at: string;
  }>(checkoutsResult.data).map((row) => {
    const from = row.taken_at ? localDate(row.taken_at) : row.start_date;
    const until = row.returned_at ? localDate(row.returned_at) : today;
    return {
      id: row.id,
      item: itemName.get(row.equipment_id) ?? 'Removed item',
      holder: person.get(row.holder_id)?.full_name ?? '—',
      holderRole: person.get(row.holder_id)?.job_title ?? null,
      mine: row.holder_id === userId,
      status: row.status,
      purpose: [row.project_id ? projectName.get(row.project_id) : null, row.purpose].filter(Boolean).join(' · ') || null,
      from,
      dueBack: row.due_back,
      returnedOn: row.returned_at ? localDate(row.returned_at) : null,
      days: row.status === 'out' || row.status === 'returned' ? daysBetween(from, until) : null,
      overdue: row.status === 'out' && Boolean(row.due_back) && row.due_back! < today,
      decidedBy: row.decided_by ? (person.get(row.decided_by)?.full_name ?? null) : null,
      note: row.note,
      askedOn: localDate(row.created_at),
    };
  });

  // How many of each item are out right now, from the checkout list.
  const outCount = new Map<string, number>();
  for (const row of rowsOf<{ equipment_id: string; status: string }>(checkoutsResult.data)) {
    if (row.status === 'out') outCount.set(row.equipment_id, (outCount.get(row.equipment_id) ?? 0) + 1);
  }
  const equipmentRows = equipment.map((item) => {
    const holder = item.current_holder_id ? person.get(item.current_holder_id) : undefined;
    const quantity = Number((item as { quantity?: number }).quantity ?? 1);
    const out = outCount.get(item.id) ?? 0;
    return {
      ...item,
      quantity,
      // Several of a kind: "2 of 4 out" instead of one holder.
      holder_name: quantity > 1 ? (out > 0 ? `${out} of ${quantity} out` : `All ${quantity} in storage`) : (holder?.full_name ?? 'In storage'),
      holder_role: holder?.job_title ?? null,
      held_since: item.holder_since ? item.holder_since.slice(0, 10) : null,
      origin: item.source_expense_id ? 'Cash flow purchase' : 'Registered manually',
    };
  });
  const needRows = needs.map((need) => ({
    ...need,
    requested_by_name: need.requested_by ? (person.get(need.requested_by)?.full_name ?? '—') : null,
    asked_on: localDate(need.created_at),
  }));
  const stillNeeded = needRows.filter((need) => need.status === 'needed');
  const acquired = needRows.filter((need) => need.status === 'acquired');
  const tripRows = trips.map((trip) => ({
    ...trip,
    traveler_name: trip.traveler_id ? (person.get(trip.traveler_id)?.full_name ?? '—') : null,
    entered_by: trip.created_by ? (person.get(trip.created_by)?.full_name ?? '—') : '—',
    approved_by_name: trip.approved_by ? (person.get(trip.approved_by)?.full_name ?? '—') : null,
    // What the trip was for: the project, the client, and anything typed in by hand.
    travelling_for:
      [
        trip.project_id ? `Project: ${projectName.get(trip.project_id) ?? '—'}` : null,
        trip.client_id ? `Client: ${clientName.get(trip.client_id) ?? '—'}` : null,
        trip.purpose || null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
  }));
  const purposeFields: Field[] = hasTripPurpose
    ? [
        { name: 'project_id', label: 'For project', type: 'select', options: options(projects, (project) => project.name), hint: 'Choose an existing project, if the trip is for one.' },
        { name: 'client_id', label: 'For client', type: 'select', options: options(clients, (client) => client.name), hint: 'Choose an existing client, if the trip is for one.' },
        { name: 'purpose', label: 'Other purpose', placeholder: 'New client meeting, location visit…', hint: 'Type it here when it is not for a listed project or client.' },
      ]
    : [];

  const equipmentFields: Field[] = [
    { name: 'name', label: 'Name', required: true },
    { name: 'category', label: 'Category', placeholder: 'Camera, lens, audio…' },
    { name: 'quantity', label: 'Quantity', type: 'number', defaultValue: '1', hint: 'How many of this item there are, e.g. 4 lights. As many can be checked out at once.' },
    { name: 'serial_number', label: 'Serial number', hint: 'For several of a kind, list them in Notes.' },
    { name: 'purchase_price', label: 'Purchase price', type: 'number', hint: 'Optional, for all of them together. Leave empty if unknown.' },
    { name: 'purchase_date', label: 'Purchase date', type: 'date' },
    { name: 'status', label: 'Status', type: 'select', required: true, defaultValue: 'available', options: enumOptions(['available', 'in_use', 'maintenance', 'retired']) },
    { name: 'condition', label: 'Condition', type: 'select', options: enumOptions(['perfect', 'moderate', 'weak']), hint: 'Leave empty if not checked yet.' },
    { name: 'current_holder_id', label: 'Currently held by', type: 'select', options: staff },
    { name: 'notes', label: 'Notes', type: 'textarea' },
  ];

  const fixedTotal = fixed.filter((item) => item.is_active).reduce((total, item) => total + Number(item.monthly_amount), 0);
  const assetValue = equipment
    .filter((item) => item.status !== 'retired')
    .reduce((total, item) => total + Number(item.purchase_price ?? 0), 0);

  const available = equipment.filter((item) => item.status !== 'retired');
  const out = checkouts.filter((row) => row.status === 'out');
  const waiting = checkouts.filter((row) => row.status === 'requested');
  const history = checkouts.filter((row) => row.status === 'returned' || row.status === 'declined' || row.status === 'cancelled');
  const manages = editsInventory;

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Logistics &amp; Costs</h1>
          <p className="muted">Equipment, who has it and until when, what the studio needs, and running costs.</p>
        </div>
      </div>

      <nav className="tabs" aria-label="Logistics sections">
        {tabs.map((item) => (
          <Link key={item.key} href={`/logistics?tab=${item.key}`} aria-current={tab === item.key ? 'page' : undefined}>
            {item.label}
            {item.key === 'checkouts' && (manages ? waiting.length : 0) > 0 ? <span className="count">{waiting.length}</span> : null}
          </Link>
        ))}
      </nav>

      {tab === 'equipment' ? (
      <ResourceManager
          title="Equipment"
          description={
            seesInventory
              ? `Tracked on its own, not tied to projects. Known asset value: ${money(assetValue)}.`
              : 'Everything the studio has, and who holds it. To take something, ask under Checkouts.'
          }
          endpoint="/api/equipment"
          rows={asRows(equipmentRows)}
          columns={[
            { key: 'name', label: 'Item' },
            { key: 'quantity', label: 'Qty' },
            { key: 'category', label: 'Category' },
            { key: 'serial_number', label: 'Serial' },
            ...(seesInventory ? [{ key: 'purchase_price', label: 'Price', kind: 'money' as const }] : []),
            { key: 'status', label: 'Status', kind: 'label' },
            { key: 'condition', label: 'Condition', kind: 'label' },
            { key: 'holder_name', label: 'Held by' },
            { key: 'holder_role', label: 'Role' },
            { key: 'held_since', label: 'Since' },
            { key: 'origin', label: 'Source' },
          ]}
          fields={equipmentFields}
          canWrite={editsInventory}
          needsApproval={needsApproval}
          addLabel="Register equipment"
          emptyText="No equipment registered yet."
        />
      ) : null}

      {tab === 'checkouts' ? (
        <>
          <section className="panel">
            <header className="panel-header">
              <div>
                <h2>{isAdmin ? 'Hand out equipment' : 'Ask to take equipment'}</h2>
                <p className="muted">
                  {manages
                    ? isAdmin
                      ? 'Record who takes an item and until when. It is handed over straight away.'
                      : 'Ask for an item you are taking, and until when. It waits as a request until it is approved.'
                    : 'Choose the item, what it is for and when you will bring it back. An admin or the logistics team approves it.'}
                </p>
              </div>
            </header>
            <ApiForm
              endpoint="/api/equipment-checkouts"
              submitLabel={isAdmin ? 'Hand over' : 'Send request'}
              initial={{ start_date: today }}
              fields={[
                { name: 'equipment_id', label: 'Item', type: 'select', required: true, options: available.map((item) => ({ value: item.id, label: `${item.name}${item.current_holder_id ? ` (with ${person.get(item.current_holder_id)?.full_name ?? 'someone'})` : ''}` })) },
                // Only an admin chooses who takes it; everyone else takes it for themselves.
                ...(isAdmin ? [{ name: 'holder_id', label: 'Taken by', type: 'select' as const, options: staff, hint: 'Leave empty for yourself.' }] : []),
                { name: 'project_id', label: 'For project', type: 'select', options: options(projects, (project) => project.name) },
                { name: 'purpose', label: 'Purpose', placeholder: 'Client shoot, location scout…' },
                { name: 'start_date', label: 'From', type: 'date', required: true },
                { name: 'due_back', label: 'Back by', type: 'date', hint: 'When it will be returned.' },
              ]}
            />
          </section>

          {manages || waiting.some((row) => row.mine) ? (
            <CheckoutList
              title="Waiting for approval"
              description={manages ? 'Approve to hand the item over, or decline.' : 'Your requests that are waiting.'}
              rows={manages ? waiting : waiting.filter((row) => row.mine)}
              manages={manages}
              empty="No requests waiting."
            />
          ) : null}

          <CheckoutList
            title="Out now"
            description="Who has which item, since when, for how long, and when it is due back. Late returns are marked red."
            rows={out}
            manages={manages}
            empty="Everything is in storage."
          />

          <CheckoutList title="History" description="Returned, declined and cancelled." rows={history.slice(0, 60)} manages={false} empty="No history yet." />
        </>
      ) : null}

      {tab === 'needs' ? (
        <>
      <ResourceManager
        title="Urgently needed"
        description={
          seesInventory
            ? 'Things the studio needs to get soon. Anyone can add to this list; edit an item to mark it acquired.'
            : 'Flag something the studio needs to get soon. You see the items you asked for.'
        }
        endpoint="/api/equipment-needs"
        rows={asRows(stillNeeded)}
        columns={[
          { key: 'item_name', label: 'Item' },
          { key: 'quantity', label: 'Qty', kind: 'number' },
          { key: 'note', label: 'Note' },
          { key: 'requested_by_name', label: 'Asked by' },
          { key: 'asked_on', label: 'Date' },
        ]}
        fields={[
          { name: 'item_name', label: 'Item', required: true, placeholder: 'Camera battery' },
          { name: 'quantity', label: 'Quantity', type: 'number', required: true, defaultValue: '1' },
          { name: 'note', label: 'Note', placeholder: 'Needed for Friday\'s shoot' },
        ]}
        editFields={
          editsInventory
            ? [
                { name: 'item_name', label: 'Item', required: true },
                { name: 'quantity', label: 'Quantity', type: 'number', required: true },
                { name: 'note', label: 'Note' },
                { name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['needed', 'acquired']) },
              ]
            : []
        }
        canWrite
        allowDelete={editsInventory}
        addLabel="Add needed item"
        emptyText="Nothing is urgently needed right now."
      />

      {seesInventory && acquired.length > 0 ? (
        <ResourceManager
          title="Acquired"
          endpoint="/api/equipment-needs"
          rows={asRows(acquired)}
          columns={[
            { key: 'item_name', label: 'Item' },
            { key: 'quantity', label: 'Qty', kind: 'number' },
            { key: 'requested_by_name', label: 'Asked by' },
            { key: 'status', label: 'Status', kind: 'label' },
          ]}
          editFields={[{ name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['needed', 'acquired']) }]}
          canWrite={editsInventory}
        />
      ) : null}
        </>
      ) : null}

      {tab === 'fixed' && seesCosts ? (
          <ResourceManager
            title="Fixed monthly expenses"
            description={`Active total: ${money(fixedTotal)} per month.`}
            endpoint="/api/fixed-expenses"
            rows={asRows(
              fixed.map((row) => {
                const auto = row as FixedExpense & { auto_record?: boolean; record_day?: number };
                return { ...row, auto_label: auto.auto_record ? `Yes · day ${auto.record_day ?? 1}` : 'No' };
              }),
            )}
            columns={[
              { key: 'name', label: 'Expense' },
              { key: 'kind', label: 'Type', kind: 'label' },
              { key: 'monthly_amount', label: 'Per month', kind: 'money' },
              { key: 'is_active', label: 'Active', kind: 'bool' },
              ...(autoReady ? [{ key: 'auto_label', label: 'Recorded by itself' }] : []),
            ]}
            fields={[
              { name: 'name', label: 'Name', required: true, placeholder: 'Office rent' },
              { name: 'kind', label: 'Type', type: 'select', required: true, defaultValue: 'other', options: enumOptions(['rent', 'utilities', 'other']) },
              { name: 'monthly_amount', label: 'Monthly amount', type: 'number', required: true },
              { name: 'is_active', label: 'Active', type: 'checkbox' },
              ...(autoReady
                ? [
                    { name: 'auto_record', label: 'Record it in Cash Flow every month by itself', type: 'checkbox' as const, defaultValue: 'false' },
                    { name: 'record_day', label: 'On day of the month', type: 'number' as const, defaultValue: '1', hint: '1 to 28.' },
                    { name: 'account_id', label: 'Paid from account', type: 'select' as const, options: accountOptions },
                  ]
                : []),
            ]}
            canWrite={editsCosts}
            needsApproval={needsApproval}
            addLabel="Add fixed expense"
            emptyText="No fixed expenses yet."
          />
      ) : null}

      {tab === 'travel' && seesCosts ? (
          <ResourceManager
            title="Transport expenses"
            description="One entry per trip. These also appear under expenses in Cash Flow."
            endpoint="/api/expenses"
            rows={asRows(tripRows)}
            columns={[
              { key: 'expense_date', label: 'Date' },
              { key: 'description', label: 'Trip' },
              { key: 'travelling_for', label: 'Travelling for' },
              { key: 'trip_origin', label: 'From' },
              { key: 'trip_destination', label: 'To' },
              { key: 'traveler_name', label: 'Whose cost' },
              ...(isAdmin ? [{ key: 'entered_by', label: 'Entered by' }, { key: 'approved_by_name', label: 'Approved by' }] : []),
              { key: 'amount', label: 'Cost', kind: 'money' },
            ]}
            fields={[
              { name: 'description', label: 'Trip', required: true, placeholder: 'Client shoot' },
              // Only an admin chooses who travelled; for everyone else the trip is their own.
              ...(isAdmin ? [{ name: 'traveler_id', label: 'Traveller', type: 'select' as const, options: staff }] : []),
              ...purposeFields,
              { name: 'expense_date', label: 'Date', type: 'date', required: true },
              { name: 'trip_origin', label: 'From', required: true },
              { name: 'trip_destination', label: 'To', required: true },
              { name: 'amount', label: 'Cost', type: 'number', required: true },
            ]}
            fixedValues={isAdmin ? { category: 'transport' } : { category: 'transport', traveler_id: userId }}
            canWrite={editsCosts}
            needsApproval={needsApproval}
            addLabel="Add trip"
            emptyText="No trips recorded yet."
          />
      ) : null}
    </>
  );
}

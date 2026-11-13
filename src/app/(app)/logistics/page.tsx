import { ResourceManager } from '@/components/resource-manager';
import type { Field } from '@/components/types';
import { money } from '@/lib/format';
import { asRows, enumOptions, getPageContext, options, peopleOptions, rowsOf } from '@/lib/page';
import type { Client, Equipment, EquipmentNeed, Expense, FixedExpense, Profile, Project } from '@/types/database';

export default async function LogisticsPage() {
  const { supabase, orgId, userId, isAdmin, can, localDate } = await getPageContext();
  const seesInventory = can('equipment');
  const seesCosts = can('costs');
  // Admins change things directly; other roles with access propose changes for approval.
  const needsApproval = !isAdmin;

  // Row level security narrows every query to what the viewer's roles allow:
  // without the equipment segment only the items they hold come back, and
  // without the costs segment the cost tables come back empty.
  const [equipmentResult, peopleResult, fixedResult, tripsResult, needsResult, projectsResult, clientsResult, purposeProbe] = await Promise.all([
    supabase.from('equipment').select('*').eq('org_id', orgId).order('name'),
    supabase.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
    supabase.from('fixed_expenses').select('*').eq('org_id', orgId).order('name'),
    supabase.from('expenses').select('*').eq('org_id', orgId).eq('category', 'transport').order('expense_date', { ascending: false }),
    supabase.from('equipment_needs').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
    supabase.from('projects').select('id, name, status').eq('org_id', orgId).order('name'),
    supabase.from('clients').select('id, name').eq('org_id', orgId).order('name'),
    // The trip purpose columns arrive with a database update; until then the form leaves them out.
    supabase.from('expenses').select('project_id').limit(1),
  ]);
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
    { name: 'serial_number', label: 'Serial number' },
    { name: 'purchase_price', label: 'Purchase price', type: 'number', hint: 'Optional. Leave empty if unknown.' },
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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Logistics &amp; Costs</h1>
          <p className="muted">
            {seesInventory || seesCosts ? 'Equipment, who holds it, and the running costs of the studio.' : 'The equipment you are responsible for.'}
          </p>
        </div>
      </div>

      <ResourceManager
        title={seesInventory ? 'Equipment' : 'Equipment you hold'}
        description={
          seesInventory
            ? `Tracked on its own, not tied to projects. Known asset value: ${money(assetValue)}.`
            : 'Items currently recorded as held by you.'
        }
        endpoint="/api/equipment"
        rows={asRows(equipmentRows)}
        columns={[
          { key: 'name', label: 'Item' },
          { key: 'category', label: 'Category' },
          { key: 'serial_number', label: 'Serial' },
          { key: 'purchase_price', label: 'Price', kind: 'money' },
          { key: 'status', label: 'Status', kind: 'label' },
          { key: 'condition', label: 'Condition', kind: 'label' },
          { key: 'holder_name', label: 'Held by' },
          { key: 'holder_role', label: 'Role' },
          { key: 'held_since', label: 'Since' },
          { key: 'origin', label: 'Source' },
        ]}
        fields={equipmentFields}
        canWrite={isAdmin || seesInventory}
        needsApproval={needsApproval}
        addLabel="Register equipment"
        emptyText={seesInventory ? 'No equipment registered yet.' : 'You are not holding any equipment.'}
      />

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
          seesInventory
            ? [
                { name: 'item_name', label: 'Item', required: true },
                { name: 'quantity', label: 'Quantity', type: 'number', required: true },
                { name: 'note', label: 'Note' },
                { name: 'status', label: 'Status', type: 'select', required: true, options: enumOptions(['needed', 'acquired']) },
              ]
            : []
        }
        canWrite
        allowDelete={seesInventory}
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
          canWrite
        />
      ) : null}

      {seesCosts ? (
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
            canWrite={isAdmin || seesCosts}
            needsApproval={needsApproval}
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
              { key: 'description', label: 'Trip' },
              { key: 'travelling_for', label: 'Travelling for' },
              { key: 'trip_origin', label: 'From' },
              { key: 'trip_destination', label: 'To' },
              { key: 'traveler_name', label: 'Traveller' },
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
            canWrite={isAdmin || seesCosts}
            needsApproval={needsApproval}
            addLabel="Add trip"
            emptyText="No trips recorded yet."
          />
        </>
      ) : null}
    </>
  );
}

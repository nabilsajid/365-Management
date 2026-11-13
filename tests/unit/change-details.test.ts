import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeDetails } from '../../src/lib/domain/changes';

const names: Record<string, string> = { p1: 'Rafi', pr1: 'Brand film', c1: 'Acme' };
const nameOf = (id: string) => names[id];

test('a new trip is shown as labelled fields, with names instead of ids', () => {
  const details = changeDetails(
    {
      method: 'POST',
      path: '/api/expenses',
      summary: 'Add expense "meeting" (category: transport, description: meeting, amount: 200)',
      body: {
        category: 'transport', description: 'meeting', amount: 200, expense_date: '2026-11-26',
        trip_origin: 'dhaka', trip_destination: 'gulshan', traveler_id: 'p1', project_id: 'pr1', client_id: null, purpose: null, account_id: null,
      },
    },
    nameOf,
  );
  assert.equal(details.heading, 'Add expense');
  assert.equal(details.name, 'meeting');
  assert.deepEqual(details.fields, [
    { label: 'Category', value: 'Transport' },
    { label: 'Description', value: 'meeting' },
    { label: 'Amount', value: '৳200' },
    { label: 'Date', value: '2026-11-26' },
    { label: 'From', value: 'dhaka' },
    { label: 'To', value: 'gulshan' },
    { label: 'Traveller', value: 'Rafi' },
    { label: 'Project', value: 'Brand film' },
  ]);
});

test('an edit shows cleared fields; unknown ids are left out', () => {
  const details = changeDetails(
    { method: 'PATCH', path: '/api/equipment/00000000-0000-0000-0000-000000000001', summary: 'Change equipment "Sony A7" (notes: empty)', body: { notes: null, current_holder_id: 'gone', is_active: false, member_ids: ['p1', 'x'] } },
    nameOf,
  );
  assert.equal(details.heading, 'Change equipment');
  assert.equal(details.name, 'Sony A7');
  assert.deepEqual(details.fields, [
    { label: 'Notes', value: 'Cleared' },
    { label: 'Active', value: 'No' },
    { label: 'Team', value: 'Rafi' },
  ]);
});

test('a delete has a heading and a name only', () => {
  const details = changeDetails({ method: 'DELETE', path: '/api/clients/abc', summary: 'Delete client "Acme"', body: null }, nameOf);
  assert.deepEqual(details, { heading: 'Delete client', name: 'Acme', fields: [] });
});

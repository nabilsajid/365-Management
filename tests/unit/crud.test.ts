import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeFields, makeCrud, summarize, type ApiContext, type ResourceConfig } from '../../src/lib/api/crud';
import type { Profile } from '../../src/types/database';
import { fakeSupabase, type Result } from './fake-supabase';

const ORG = '00000000-0000-0000-0000-000000000001';
const ROW_ID = '11111111-1111-1111-1111-111111111111';

function profile(role: 'admin' | 'employee'): Profile {
  return {
    id: role === 'admin' ? 'admin-user' : 'employee-user',
    org_id: ORG,
    full_name: role,
    job_title: null,
    access_role: role,
    is_active: true,
    created_at: '2026-11-01T00:00:00Z',
  };
}

// Accepts any object that has a non-empty name; stands in for a zod schema.
const schema = {
  safeParse(value: Record<string, unknown>) {
    return value && typeof value.name === 'string' && value.name
      ? { success: true, data: value }
      : { success: false, error: { issues: [{ path: ['name'], message: 'This field is required.' }] } };
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const anySchema = {
  safeParse: (value: unknown) => ({ success: true, data: value }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

function setup(role: 'admin' | 'employee' | null, results: Result[] = [], segments: string[] = []) {
  const db = fakeSupabase(results);
  const ctx: ApiContext | null = role
    ? { supabase: db.client, userId: profile(role).id, profile: profile(role), segments: new Set(segments) }
    : null;
  return { db, crud: makeCrud(async () => ctx) };
}

const config: ResourceConfig = {
  table: 'clients',
  createSchema: schema,
  updateSchema: anySchema,
  filters: ['status'],
};

const post = (body: unknown) =>
  new Request('http://test/api/clients', { method: 'POST', body: JSON.stringify(body) });
const patch = (body: unknown) =>
  new Request(`http://test/api/clients/${ROW_ID}`, { method: 'PATCH', body: JSON.stringify(body) });
const params = (id: string) => ({ params: Promise.resolve({ id }) });

test('signed-out requests are rejected with 401', async () => {
  const { db, crud } = setup(null);
  const response = await crud.collection(config).GET(new Request('http://test/api/clients'));
  assert.equal(response.status, 401);
  assert.equal(db.calls.length, 0);
});

test('an employee cannot create, edit or delete, and the database is never touched', async () => {
  const { db, crud } = setup('employee');
  assert.equal((await crud.collection(config).POST(post({ name: 'Acme' }))).status, 403);
  assert.equal((await crud.item(config).PATCH(patch({ name: 'Acme' }), params(ROW_ID))).status, 403);
  assert.equal((await crud.item(config).DELETE(new Request('http://test'), params(ROW_ID))).status, 403);
  assert.equal(db.calls.length, 0);
});

test('an admin can create, and the record is always placed in their own organization', async () => {
  const { db, crud } = setup('admin', [{ data: { id: ROW_ID, name: 'Acme' }, error: null }]);
  const response = await crud.collection(config).POST(post({ name: 'Acme', org_id: 'someone-else' }));

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { data: { id: ROW_ID, name: 'Acme' } });
  assert.deepEqual(db.calls[0], ['from', 'clients']);
  assert.deepEqual(db.called('insert')[0][1], { name: 'Acme', org_id: ORG });
});

test('an admin can edit and delete any record in their organization', async () => {
  const { db, crud } = setup('admin', [
    { data: { id: ROW_ID, name: 'Renamed' }, error: null },
    { data: { id: ROW_ID }, error: null },
  ]);
  const edited = await crud.item(config).PATCH(patch({ name: 'Renamed' }), params(ROW_ID));
  const removed = await crud.item(config).DELETE(new Request('http://test'), params(ROW_ID));

  assert.equal(edited.status, 200);
  assert.equal(removed.status, 200);
  assert.deepEqual(db.called('update')[0][1], { name: 'Renamed' });
  assert.equal(db.called('delete').length, 1);
  // Both operations are scoped to the row and to the admin's organization.
  assert.equal(db.calls.filter(([name, column, value]) => name === 'eq' && column === 'org_id' && value === ORG).length, 2);
  assert.equal(db.calls.filter(([name, column, value]) => name === 'eq' && column === 'id' && value === ROW_ID).length, 2);
});

test('invalid input is rejected with 400 before reaching the database', async () => {
  const { db, crud } = setup('admin');
  const response = await crud.collection(config).POST(post({ name: '' }));
  const body = (await response.json()) as { error: { message: string } };

  assert.equal(response.status, 400);
  assert.equal(body.error.message, 'name: This field is required.');
  assert.equal(db.calls.length, 0);
});

test('a body that is not JSON is rejected with 400', async () => {
  const { crud } = setup('admin');
  const response = await crud.collection(config).POST(new Request('http://test', { method: 'POST', body: 'nope' }));
  assert.equal(response.status, 400);
});

test('an empty edit is rejected', async () => {
  const { db, crud } = setup('admin');
  const response = await crud.item(config).PATCH(patch({}), params(ROW_ID));
  assert.equal(response.status, 400);
  assert.equal(db.called('update').length, 0);
});

test('employees can list operational data, scoped to their organization', async () => {
  const { db, crud } = setup('employee', [{ data: [{ id: ROW_ID }], error: null }]);
  const response = await crud
    .collection(config)
    .GET(new Request('http://test/api/clients?status=active&org_id=other&secret=1'));

  assert.equal(response.status, 200);
  const filters = db.called('eq').map(([, column, value]) => `${String(column)}=${String(value)}`);
  // Only the organization scope and whitelisted filters are applied.
  assert.deepEqual(filters, [`org_id=${ORG}`, 'status=active']);
});

test('cash-flow style resources are hidden from employees', async () => {
  const { db, crud } = setup('employee');
  const adminOnly: ResourceConfig = { ...config, table: 'expenses', read: 'admin' };

  assert.equal((await crud.collection(adminOnly).GET(new Request('http://test/api/expenses'))).status, 403);
  assert.equal((await crud.item(adminOnly).GET(new Request('http://test'), params(ROW_ID))).status, 403);
  assert.equal(db.calls.length, 0);
});

test('a role that includes the segment can read but still cannot edit', async () => {
  const finance: ResourceConfig = { ...config, table: 'invoices', read: ['cashflow'] };

  const allowed = setup('employee', [{ data: [], error: null }], ['cashflow']);
  assert.equal((await allowed.crud.collection(finance).GET(new Request('http://test/api/invoices'))).status, 200);
  assert.equal((await allowed.crud.collection(finance).POST(post({ name: 'INV' }))).status, 403);

  const other = setup('employee', [], ['projects', 'team_points']);
  const refused = await other.crud.collection(finance).GET(new Request('http://test/api/invoices'));
  assert.equal(refused.status, 403);
  assert.equal(other.db.calls.length, 0);

  const admin = setup('admin', [{ data: [], error: null }]);
  assert.equal((await admin.crud.collection(finance).GET(new Request('http://test/api/invoices'))).status, 200);
});

test('a missing record gives 404', async () => {
  const { crud } = setup('admin', [{ data: null, error: null }]);
  const response = await crud.item(config).PATCH(patch({ name: 'X' }), params(ROW_ID));
  assert.equal(response.status, 404);
});

test('a malformed id gives 404 without a query', async () => {
  const { db, crud } = setup('admin');
  const response = await crud.item(config).GET(new Request('http://test'), params('not-a-uuid'));
  assert.equal(response.status, 404);
  assert.equal(db.calls.length, 0);
});

test('server-side stamps are added on create and update and cannot be spoofed', async () => {
  const { db, crud } = setup('admin', [
    { data: { id: ROW_ID }, error: null },
    { data: { id: ROW_ID }, error: null },
  ]);
  const stamped: ResourceConfig = {
    ...config,
    onCreate: (ctx) => ({ created_by: ctx.userId }),
    onUpdate: (ctx, data) => (data.status === 'approved' ? { decided_by: ctx.userId } : { decided_by: null }),
  };

  await crud.collection(stamped).POST(post({ name: 'Acme', created_by: 'spoofed' }));
  await crud.item(stamped).PATCH(patch({ status: 'approved', decided_by: 'spoofed' }), params(ROW_ID));

  assert.deepEqual(db.called('insert')[0][1], { name: 'Acme', created_by: 'admin-user', org_id: ORG });
  assert.deepEqual(db.called('update')[0][1], { status: 'approved', decided_by: 'admin-user' });
});

test('database errors map to useful HTTP statuses', async () => {
  const cases: [string, number][] = [
    ['23505', 409],
    ['23503', 409],
    ['23514', 400],
    ['42501', 403],
    ['XX000', 500],
  ];
  for (const [code, status] of cases) {
    const { crud } = setup('admin', [{ data: null, error: { code, message: 'db said no' } }]);
    const response = await crud.collection(config).POST(post({ name: 'Acme' }));
    assert.equal(response.status, status, `code ${code}`);
  }
});

test('a resource without a create schema refuses POST', async () => {
  const { crud } = setup('admin');
  const response = await crud.collection({ table: 'bonuses' }).POST(post({ name: 'X' }));
  assert.equal(response.status, 405);
});

// --- Change requests: roles propose, admins apply ---------------------------

const proposable: ResourceConfig = { ...config, table: 'equipment', label: 'equipment', propose: ['equipment'] };

test('a role with the segment proposes a new record instead of creating it', async () => {
  const { db, crud } = setup('employee', [{ data: null, error: null }], ['equipment']);
  const response = await crud.collection(proposable).POST(
    new Request('http://test/api/equipment', { method: 'POST', body: JSON.stringify({ name: 'Light stand', purchase_price: 4500 }) }),
  );

  assert.equal(response.status, 202);
  assert.deepEqual((await response.json()).data.pending, true);
  assert.deepEqual(db.called('from').map(([, table]) => table), ['change_requests']);
  const stored = db.called('insert')[0][1] as Record<string, unknown>;
  assert.equal(stored.method, 'POST');
  assert.equal(stored.path, '/api/equipment');
  assert.equal(stored.requested_by, 'employee-user');
  assert.equal(stored.org_id, ORG);
  assert.deepEqual(stored.body, { name: 'Light stand', purchase_price: 4500 });
  assert.equal(stored.summary, 'Add equipment "Light stand" (name: Light stand, purchase price: 4500)');
});

test('proposed edits and deletions name the record and never touch it', async () => {
  const current = { id: ROW_ID, name: 'Sony FX3', status: 'available' };
  const edit = setup('employee', [{ data: current, error: null }, { data: null, error: null }], ['equipment']);
  const edited = await edit.crud.item(proposable).PATCH(
    new Request(`http://test/api/equipment/${ROW_ID}`, { method: 'PATCH', body: JSON.stringify({ condition: 'weak' }) }),
    params(ROW_ID),
  );
  assert.equal(edited.status, 202);
  assert.equal(edit.db.called('update').length, 0);
  const editRow = edit.db.called('insert')[0][1] as Record<string, unknown>;
  assert.equal(editRow.summary, 'Change equipment "Sony FX3" (condition: weak)');
  assert.equal(editRow.path, `/api/equipment/${ROW_ID}`);

  const remove = setup('employee', [{ data: current, error: null }, { data: null, error: null }], ['equipment']);
  const removed = await remove.crud.item(proposable).DELETE(
    new Request(`http://test/api/equipment/${ROW_ID}`, { method: 'DELETE' }),
    params(ROW_ID),
  );
  assert.equal(removed.status, 202);
  assert.equal(remove.db.called('delete').length, 0);
  const removeRow = remove.db.called('insert')[0][1] as Record<string, unknown>;
  assert.equal(removeRow.summary, 'Delete equipment "Sony FX3"');
  assert.equal(removeRow.body, null);
});

test('a change cannot be proposed for a record the person cannot see', async () => {
  const { db, crud } = setup('employee', [{ data: null, error: null }], ['equipment']);
  const response = await crud.item(proposable).PATCH(
    new Request(`http://test/api/equipment/${ROW_ID}`, { method: 'PATCH', body: JSON.stringify({ name: 'X' }) }),
    params(ROW_ID),
  );
  assert.equal(response.status, 404);
  assert.equal(db.called('insert').length, 0);
});

test('invalid input is rejected before a change request is stored', async () => {
  const { db, crud } = setup('employee', [], ['equipment']);
  const response = await crud.collection(proposable).POST(
    new Request('http://test/api/equipment', { method: 'POST', body: JSON.stringify({ name: '' }) }),
  );
  assert.equal(response.status, 400);
  assert.equal(db.calls.length, 0);
});

test('a role without the segment can neither change nor propose', async () => {
  const { db, crud } = setup('employee', [], ['cashflow']);
  const response = await crud.collection(proposable).POST(
    new Request('http://test/api/equipment', { method: 'POST', body: JSON.stringify({ name: 'Light stand' }) }),
  );
  assert.equal(response.status, 403);
  assert.equal(db.calls.length, 0);
});

test('an admin applies the same change directly, with no request', async () => {
  const { db, crud } = setup('admin', [{ data: { id: ROW_ID }, error: null }]);
  const response = await crud.collection(proposable).POST(
    new Request('http://test/api/equipment', { method: 'POST', body: JSON.stringify({ name: 'Light stand' }) }),
  );
  assert.equal(response.status, 201);
  assert.deepEqual(db.called('from').map(([, table]) => table), ['equipment']);
});

test('summaries read naturally', () => {
  assert.equal(summarize('Add', 'expense', 'Taxi to shoot', { amount: 400, trip_origin: 'Office', note: null }), 'Add expense "Taxi to shoot" (amount: 400, trip origin: Office)');
  assert.equal(summarize('Add', 'invoice', 'INV-7', { client_id: 'abc', project_id: null, invoice_number: 'INV-7', amount: 3453 }), 'Add invoice "INV-7" (invoice number: INV-7, amount: 3453)');
  assert.equal(summarize('Change', 'equipment', 'Tripod', { notes: null, current_holder_id: 'abc' }), 'Change equipment "Tripod" (notes: empty)');
  assert.equal(summarize('Delete', 'invoice', 'INV-001'), 'Delete invoice "INV-001"');
  assert.equal(summarize('Change', 'bonus', '', { status: 'approved' }), 'Change bonus (status: approved)');
  assert.equal(describeFields({ file_links: [{ label: 'a' }], name: 'X' }), 'name: X');
});

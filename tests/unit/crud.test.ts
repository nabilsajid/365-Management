import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeCrud, type ApiContext, type ResourceConfig } from '../../src/lib/api/crud';
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

function setup(role: 'admin' | 'employee' | null, results: Result[] = []) {
  const db = fakeSupabase(results);
  const ctx: ApiContext | null = role
    ? { supabase: db.client, userId: profile(role).id, profile: profile(role) }
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

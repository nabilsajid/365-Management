import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProjectWithDeliverables, resolveClient } from '../../src/lib/services/projects';
import { fakeSupabase } from './fake-supabase';

const ok = (data: unknown) => ({ data, error: null });
const tables = (db: ReturnType<typeof fakeSupabase>) => db.called('from').map(([, table]) => table);

test('a project can be added with no client, links and a team', async () => {
  const db = fakeSupabase([ok({ id: 'project-1', name: 'Internal reel' }), ok(null)]);

  const result = await createProjectWithDeliverables(db.client, 'org-1', {
    name: 'Internal reel',
    brief: 'Showreel for the website.',
    file_links: [{ label: 'Brief', url: 'https://docs.google.com/document/d/1' }],
    member_ids: ['user-1', 'user-2'],
  });

  assert.equal(result.error, undefined);
  assert.deepEqual(tables(db), ['projects']);
  const row = db.called('insert')[0][1] as Record<string, unknown>;
  assert.equal(row.client_id, null);
  assert.equal(row.org_id, 'org-1');
  assert.deepEqual(row.file_links, [{ label: 'Brief', url: 'https://docs.google.com/document/d/1' }]);
  assert.ok(!('member_ids' in row) && !('client_name' in row) && !('deliverables' in row));
  assert.deepEqual(db.called('rpc')[0], ['rpc', 'set_project_members', { p_project: 'project-1', p_members: ['user-1', 'user-2'] }]);
  assert.deepEqual(result.data?.tasks, []);
});

test('a typed client name reuses the existing client', async () => {
  const db = fakeSupabase([ok([{ id: 'client-9' }]), ok({ id: 'project-1' })]);
  await createProjectWithDeliverables(db.client, 'org-1', { name: 'Launch', client_name: '  Acme ' });

  assert.deepEqual(tables(db), ['clients', 'projects']);
  assert.deepEqual(db.called('ilike')[0], ['ilike', 'name', 'Acme']);
  assert.equal(db.called('insert').length, 1);
  assert.equal((db.called('insert')[0][1] as Record<string, unknown>).client_id, 'client-9');
  assert.equal(db.called('rpc').length, 0);
});

test('a new client name creates the client', async () => {
  const db = fakeSupabase([ok([]), ok({ id: 'client-new' })]);
  const result = await resolveClient(db.client, 'org-1', 'Fresh Co');

  assert.equal(result.data, 'client-new');
  assert.deepEqual(db.called('insert')[0][1], { org_id: 'org-1', name: 'Fresh Co' });
});

test('a blank client name means no client and no lookup', async () => {
  const db = fakeSupabase();
  assert.equal((await resolveClient(db.client, 'org-1', '   ')).data, null);
  assert.equal((await resolveClient(db.client, 'org-1', null)).data, null);
  assert.equal(db.calls.length, 0);
});

test('wildcards in a client name are matched literally', async () => {
  const db = fakeSupabase([ok([{ id: 'c' }])]);
  await resolveClient(db.client, 'org-1', '100%_Studio');
  assert.deepEqual(db.called('ilike')[0], ['ilike', 'name', '100\\%\\_Studio']);
});

test('deliverables become one task each, and their assignees join the team', async () => {
  const db = fakeSupabase([ok({ id: 'project-1' }), ok(null), ok([{ id: 't1' }, { id: 't2' }])]);
  const result = await createProjectWithDeliverables(db.client, 'org-1', {
    name: 'Launch',
    deliverables: [{ title: 'Video 1', assignee_id: 'user-1' }, { title: 'Video 2' }],
  });

  assert.deepEqual(tables(db), ['projects', 'tasks']);
  assert.deepEqual(db.called('rpc')[0], ['rpc', 'set_project_members', { p_project: 'project-1', p_members: ['user-1'] }]);
  const rows = db.called('insert')[1][1] as Record<string, unknown>[];
  assert.deepEqual(rows.map((task) => task.title), ['Video 1', 'Video 2']);
  assert.ok(rows.every((task) => task.project_id === 'project-1' && task.org_id === 'org-1'));
  assert.equal((result.data?.tasks as unknown[]).length, 2);
});

test('if the team cannot be saved the project is removed again', async () => {
  const db = fakeSupabase([ok({ id: 'project-1' }), { data: null, error: { code: '22023', message: 'One of the people does not exist' } }, ok(null)]);
  const result = await createProjectWithDeliverables(db.client, 'org-1', { name: 'Launch', member_ids: ['ghost'] });

  assert.equal(result.error?.code, '22023');
  assert.equal(db.called('delete').length, 1);
  assert.ok(db.calls.some(([name, column, value]) => name === 'eq' && column === 'id' && value === 'project-1'));
});

test('if the tasks cannot be created the project is removed again', async () => {
  const db = fakeSupabase([ok({ id: 'project-1' }), { data: null, error: { code: '23503', message: 'assignee does not exist' } }, ok(null)]);
  const result = await createProjectWithDeliverables(db.client, 'org-1', { name: 'Launch', deliverables: [{ title: 'Video 1' }] });

  assert.equal(result.error?.code, '23503');
  assert.equal(db.called('delete').length, 1);
});

test('if the project cannot be created nothing else is attempted', async () => {
  const db = fakeSupabase([{ data: null, error: { code: '23514', message: 'bad' } }]);
  const result = await createProjectWithDeliverables(db.client, 'org-1', { name: 'Launch', member_ids: ['user-1'] });

  assert.equal(result.error?.code, '23514');
  assert.equal(db.called('rpc').length, 0);
});

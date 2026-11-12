import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createProjectWithDeliverables } from '../../src/lib/services/projects';
import { fakeSupabase } from './fake-supabase';

const input = {
  client_id: 'client-1',
  name: 'Launch campaign',
  brief: 'Three short videos for the launch.',
  deliverables: [
    { title: 'Video 1', description: 'Teaser', assignee_id: 'user-1' },
    { title: 'Video 2', file_links: [{ label: 'Footage', url: 'https://drive.google.com/x' }] },
    { title: 'Video 3' },
  ],
};

test('onboarding creates the project and one task per deliverable', async () => {
  const db = fakeSupabase([
    { data: { id: 'project-1', name: 'Launch campaign' }, error: null },
    { data: [{ id: 't1' }, { id: 't2' }, { id: 't3' }], error: null },
  ]);

  const result = await createProjectWithDeliverables(db.client, 'org-1', input);

  assert.equal(result.error, undefined);
  assert.deepEqual(db.calls.filter(([name]) => name === 'from').map(([, table]) => table), ['projects', 'tasks']);

  const [projectRow, taskRows] = db.called('insert').map(([, row]) => row) as [
    Record<string, unknown>,
    Record<string, unknown>[],
  ];
  assert.equal(projectRow.org_id, 'org-1');
  assert.equal(projectRow.brief, 'Three short videos for the launch.');
  assert.ok(!('deliverables' in projectRow));

  assert.equal(taskRows.length, 3);
  assert.deepEqual(taskRows.map((task) => task.title), ['Video 1', 'Video 2', 'Video 3']);
  assert.ok(taskRows.every((task) => task.project_id === 'project-1' && task.org_id === 'org-1'));
  assert.equal(taskRows[0].assignee_id, 'user-1');
  assert.equal(taskRows[2].assignee_id, null);
  assert.deepEqual((result.data?.tasks as unknown[]).length, 3);
});

test('a project with no deliverables creates no tasks', async () => {
  const db = fakeSupabase([{ data: { id: 'project-1' }, error: null }]);
  const result = await createProjectWithDeliverables(db.client, 'org-1', { ...input, deliverables: [] });

  assert.deepEqual(result.data?.tasks, []);
  assert.equal(db.called('insert').length, 1);
});

test('if the tasks cannot be created the project is removed again', async () => {
  const db = fakeSupabase([
    { data: { id: 'project-1' }, error: null },
    { data: null, error: { code: '23503', message: 'assignee does not exist' } },
    { data: null, error: null },
  ]);

  const result = await createProjectWithDeliverables(db.client, 'org-1', input);

  assert.equal(result.error?.code, '23503');
  assert.equal(db.called('delete').length, 1);
  assert.ok(db.calls.some(([name, column, value]) => name === 'eq' && column === 'id' && value === 'project-1'));
});

test('if the project cannot be created nothing else is attempted', async () => {
  const db = fakeSupabase([{ data: null, error: { code: '23503', message: 'client does not exist' } }]);
  const result = await createProjectWithDeliverables(db.client, 'org-1', input);

  assert.equal(result.error?.code, '23503');
  assert.equal(db.called('insert').length, 1);
});

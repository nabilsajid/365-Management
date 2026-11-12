import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDeliverableTasks, formatFileLinks, parseFileLinks } from '../../src/lib/domain/deliverables';

test('each deliverable becomes its own task, in order', () => {
  const tasks = buildDeliverableTasks('org-1', 'project-1', [
    { title: ' Video 1 ', description: 'Teaser cut', assignee_id: 'user-1', points_value: 300 },
    { title: 'Video 2', file_links: [{ label: 'Footage', url: 'https://drive.google.com/x' }] },
  ]);

  assert.equal(tasks.length, 2);
  assert.deepEqual(tasks[0], {
    org_id: 'org-1',
    project_id: 'project-1',
    title: 'Video 1',
    description: 'Teaser cut',
    file_links: [],
    assignee_id: 'user-1',
    points_value: 300,
    due_date: null,
    position: 0,
  });
  assert.equal(tasks[1].title, 'Video 2');
  assert.equal(tasks[1].position, 1);
  assert.equal(tasks[1].assignee_id, null);
  assert.equal(tasks[1].file_links[0].url, 'https://drive.google.com/x');
});

test('deliverable tasks never carry equipment', () => {
  const [task] = buildDeliverableTasks('org-1', 'project-1', [{ title: 'Video 1' }]);
  assert.ok(!Object.keys(task).some((key) => key.includes('equipment')));
});

test('no deliverables means no tasks', () => {
  assert.deepEqual(buildDeliverableTasks('org-1', 'project-1', []), []);
});

test('file links are read one per line, with an optional label', () => {
  const { links, invalid } = parseFileLinks(
    'Raw footage | https://drive.google.com/drive/folders/abc\n\nhttps://www.dropbox.com/s/xyz\nnot a link',
  );
  assert.deepEqual(links, [
    { label: 'Raw footage', url: 'https://drive.google.com/drive/folders/abc' },
    { label: 'www.dropbox.com', url: 'https://www.dropbox.com/s/xyz' },
  ]);
  assert.deepEqual(invalid, ['not a link']);
});

test('file links survive a round trip through the form', () => {
  const links = [{ label: 'Brief', url: 'https://docs.google.com/document/d/1' }];
  assert.deepEqual(parseFileLinks(formatFileLinks(links)).links, links);
  assert.equal(formatFileLinks(null), '');
});

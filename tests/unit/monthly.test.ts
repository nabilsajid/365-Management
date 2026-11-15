import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPackageItems, countOf, deliveryCounts, describeFixed, nextMonthStart, numberedTitles, planTasksFromFixed } from '../../src/lib/domain/deliverables';

test('the next month rolls over the year', () => {
  assert.equal(nextMonthStart('2026-11-01'), '2026-12-01');
  assert.equal(nextMonthStart('2026-12-01'), '2027-01-01');
});

test('a new monthly client turns its deliverables into the package, in order', () => {
  const items = buildPackageItems('org', 'project', [
    { title: ' Video 1 ', kind: 'video', due_day: 25 },
    { title: 'Thumbnail 1', kind: 'thumbnail', for_index: 0 },
    { title: 'Misc' },
  ]);
  assert.deepEqual(
    items.map((item) => [item.title, item.kind, item.due_day, item.position]),
    [
      ['Video 1', 'video', 25, 0],
      ['Thumbnail 1', 'thumbnail', null, 1],
      ['Misc', 'other', null, 2],
    ],
  );
});


test('the delivery counter counts approved work against optional targets', () => {
  const counts = deliveryCounts(
    [
      { kind: 'video', status: 'approved' },
      { kind: 'video', status: 'approved' },
      { kind: 'video', status: 'submitted' },
      { kind: 'post', status: 'approved' },
      { kind: 'photo', status: 'todo' },
    ],
    [
      { kind: 'video', quantity: 5 },
      { kind: 'thumbnail', quantity: 5 },
    ],
  );
  assert.deepEqual(
    counts.map((row) => [row.kind, row.delivered, row.target, row.inReview]),
    [
      ['video', 2, 5, 1],
      ['thumbnail', 0, 5, 0],
      ['photo', 0, null, 0],
      ['post', 1, null, 0],
    ],
  );
});

test('counts read naturally', () => {
  assert.equal(countOf('video', 5), '5 videos');
  assert.equal(countOf('post', 1), '1 social media post');
  assert.equal(countOf('post', 3), '3 social media posts');
});


test('fixed deliverables read naturally', () => {
  assert.equal(describeFixed({ kind: 'video', quantity: 5, label: null }), '5 videos');
  assert.equal(describeFixed({ kind: 'post', quantity: null, label: 'Social media management' }), 'Social media management');
  assert.equal(describeFixed({ kind: 'post', quantity: 3, label: 'reels' }), '3 social media posts (reels)');
});

test('a month gets only the tasks it is still missing, numbered on', () => {
  const plan = planTasksFromFixed(
    [
      { kind: 'video', quantity: 3, label: null },
      { kind: 'thumbnail', quantity: 2, label: null },
      { kind: 'post', quantity: null, label: 'Social media management' },
    ],
    [{ kind: 'video', title: 'Video 1' }],
  );
  assert.deepEqual(
    plan.map((task) => `${task.kind}:${task.title}`),
    ['video:Video 2', 'video:Video 3', 'thumbnail:Thumbnail 1', 'thumbnail:Thumbnail 2', 'post:Social media management'],
  );
  assert.deepEqual(planTasksFromFixed([{ kind: 'post', quantity: null, label: 'Social media management' }], [{ kind: 'post', title: 'social media management' }]), []);
});

test('copies are numbered after what exists', () => {
  assert.deepEqual(numberedTitles('Video', 3, 2), ['Video 3', 'Video 4', 'Video 5']);
  assert.deepEqual(numberedTitles('Reel', 1, 4), ['Reel']);
});

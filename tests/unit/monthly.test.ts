import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPackageItems, countOf, deliveryCounts, nextMonthStart } from '../../src/lib/domain/deliverables';

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

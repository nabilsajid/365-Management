import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPackageItems, nextMonthStart } from '../../src/lib/domain/deliverables';

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

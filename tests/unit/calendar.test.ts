import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventsOn, monthGrid, shiftMonth } from '../../src/lib/domain/calendar';

test('a month is shown as whole weeks from Monday to Sunday', () => {
  const weeks = monthGrid('2026-11-01');
  assert.equal(weeks[0][0], '2026-10-26', 'November 2026 starts on a Sunday, so the grid starts on the Monday before');
  assert.equal(weeks[weeks.length - 1][6], '2026-12-06');
  assert.ok(weeks.every((week) => week.length === 7));
  assert.ok(weeks.flat().includes('2026-11-30'));
});

test('events show on every day they cover, leave first', () => {
  const events = [
    { id: '1', kind: 'task' as const, title: 'Edit', start: '2026-11-14', end: '2026-11-14' },
    { id: '2', kind: 'leave' as const, title: 'Rafi away', start: '2026-11-13', end: '2026-11-15' },
  ];
  assert.deepEqual(eventsOn('2026-11-14', events).map((event) => event.id), ['2', '1']);
  assert.deepEqual(eventsOn('2026-11-15', events).map((event) => event.id), ['2']);
  assert.deepEqual(eventsOn('2026-11-16', events), []);
});

test('moving between months', () => {
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(shiftMonth('2026-01-01', -1), '2025-12-01');
});

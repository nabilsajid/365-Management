import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueLabel, dueState, soonLimit } from '../../src/lib/domain/deadlines';

test('deadlines are marked overdue, today, or soon within two days', () => {
  assert.equal(dueState('2026-11-14', '2026-11-15'), 'overdue');
  assert.equal(dueState('2026-11-15', '2026-11-15'), 'today');
  assert.equal(dueState('2026-11-16', '2026-11-15'), 'soon');
  assert.equal(dueState('2026-11-17', '2026-11-15'), 'soon');
  assert.equal(dueState('2026-11-18', '2026-11-15'), null);
  assert.equal(dueState(null, '2026-11-15'), null);
});

test('finished or submitted work is never marked late', () => {
  assert.equal(dueState('2026-11-01', '2026-11-15', 'approved'), null);
  assert.equal(dueState('2026-11-01', '2026-11-15', 'submitted'), null);
  assert.equal(dueState('2026-11-01', '2026-11-15', 'changes_requested'), 'overdue');
});

test('labels and the near limit cross month ends', () => {
  assert.equal(dueLabel('2026-12-01', '2026-11-30', 'soon'), 'Due tomorrow');
  assert.equal(dueLabel('2026-12-02', '2026-11-30', 'soon'), 'Due in 2 days');
  assert.equal(soonLimit('2026-12-31'), '2027-01-02');
});

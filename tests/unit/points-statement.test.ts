import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointsStatement } from '../../src/lib/domain/points-statement';

test('each point is counted once, under where it came from', () => {
  const statement = pointsStatement([
    { employee_id: 'a', points: 100, source: 'attendance', reason: null },
    { employee_id: 'a', points: 100, source: 'attendance', reason: null },
    { employee_id: 'a', points: 300, source: 'task', reason: null },
    { employee_id: 'a', points: 500, source: 'adjustment', reason: 'Project completed: Brand film' },
    { employee_id: 'a', points: 50, source: 'adjustment', reason: 'Helped on a weekend' },
    { employee_id: 'a', points: -40, source: 'violation', reason: 'Late' },
    { employee_id: 'a', points: -10, source: 'adjustment', reason: 'Correction' },
    { employee_id: 'b', points: 100, source: 'attendance', reason: null },
  ]);
  assert.deepEqual(statement.get('a'), { attendance: 200, tasks: 300, projects: 500, given: 50, deducted: -50, total: 1000 });
  assert.deepEqual(statement.get('b'), { attendance: 100, tasks: 0, projects: 0, given: 0, deducted: 0, total: 100 });
  assert.equal(statement.get('c'), undefined);
});

test('notifications are grouped by where they lead, and follow each person\'s choice', async () => {
  const { notificationKind, wants } = await import('../../src/lib/domain/notification-kind');
  assert.equal(notificationKind('/tasks/abc'), 'assignments');
  assert.equal(notificationKind('/projects/abc'), 'assignments');
  assert.equal(notificationKind('/projects/abc#award'), 'approvals');
  assert.equal(notificationKind('/approvals'), 'approvals');
  assert.equal(notificationKind('/updates?tab=messages'), 'updates');
  assert.equal(notificationKind('/leave'), 'leave');
  assert.equal(notificationKind('/cashflow?tab=income'), 'money');
  assert.equal(notificationKind('/logistics'), 'equipment');
  assert.equal(wants({}, '/approvals'), true);
  assert.equal(wants(null, '/approvals'), true);
  assert.equal(wants({ approvals: false }, '/approvals'), false);
  assert.equal(wants({ approvals: false }, '/tasks/x'), true);
});

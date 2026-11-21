import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryStats, monthsEnding, percent } from '../../src/lib/domain/kpi';

test('on time and first-time approvals are counted in the month of first approval', () => {
  const stats = deliveryStats(
    [
      { id: 'a', due_date: '2026-10-10' },
      { id: 'b', due_date: '2026-10-05' },
      { id: 'c', due_date: null },
    ],
    [
      { task_id: 'a', review_status: 'approved', reviewed_at: '2026-10-09T10:00:00Z', created_at: '2026-10-08T10:00:00Z' },
      { task_id: 'b', review_status: 'changes_requested', reviewed_at: '2026-10-04T10:00:00Z', created_at: '2026-10-03T10:00:00Z' },
      { task_id: 'b', review_status: 'approved', reviewed_at: '2026-10-07T10:00:00Z', created_at: '2026-10-06T10:00:00Z' },
      { task_id: 'c', review_status: 'approved', reviewed_at: '2026-11-01T10:00:00Z', created_at: '2026-10-30T10:00:00Z' },
    ],
    'Asia/Dhaka',
  );
  assert.deepEqual(stats.get('2026-10-01'), { approved: 2, withDue: 2, onTime: 1, firstTime: 1 });
  assert.deepEqual(stats.get('2026-11-01'), { approved: 1, withDue: 0, onTime: 0, firstTime: 1 });
});

test('percent and month ranges', () => {
  assert.equal(percent(1, 3), 33);
  assert.equal(percent(0, 0), null);
  assert.deepEqual(monthsEnding('2026-02-01', 3), ['2025-12-01', '2026-01-01', '2026-02-01']);
});

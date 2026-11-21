import assert from 'node:assert/strict';
import test from 'node:test';
import { daysInYear, leaveAllowance, leaveBalances, unpaidLeaveDeduction } from '../../src/lib/domain/leave';

test('allowances default to 10 casual and 14 sick days', () => {
  assert.deepEqual(leaveAllowance({}), { casual: 10, sick: 14 });
  assert.deepEqual(leaveAllowance({ leave_allowance: { casual: 12 } }), { casual: 12, sick: 14 });
});

test('only approved days inside the year count against the allowance', () => {
  const balances = leaveBalances(
    [
      { kind: 'casual', status: 'approved', start_date: '2026-12-30', end_date: '2027-01-02' },
      { kind: 'casual', status: 'pending', start_date: '2026-05-01', end_date: '2026-05-03' },
      { kind: 'sick', status: 'approved', start_date: '2026-03-01', end_date: '2026-03-02' },
      { kind: 'unpaid', status: 'approved', start_date: '2026-04-01', end_date: '2026-04-05' },
    ],
    { casual: 10, sick: 14 },
    2026,
  );
  assert.deepEqual(balances.map((row) => `${row.kind}:${row.used}/${row.left}`), ['casual:2/8', 'sick:2/12']);
  assert.equal(daysInYear({ start_date: '2026-12-30', end_date: '2027-01-02' }, 2027), 2);
});

test('an unpaid day is a thirtieth of the monthly salary', () => {
  assert.equal(unpaidLeaveDeduction(30000, 2), 2000);
});

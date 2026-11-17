import assert from 'node:assert/strict';
import test from 'node:test';
import { leaveDaysInMonth, netPay } from '../../src/lib/domain/payroll';

test('net pay adds bonus and additions and takes deductions, never below zero', () => {
  assert.equal(netPay({ base_salary: 30000, bonus: 2000, additions: 500, deductions: 1500 }), 31000);
  assert.equal(netPay({ base_salary: 1000, bonus: 0, additions: 0, deductions: 5000 }), 0);
});

test('only the leave days inside the month count', () => {
  assert.equal(leaveDaysInMonth([{ start_date: '2026-10-30', end_date: '2026-11-02' }], '2026-11-01'), 2);
  assert.equal(leaveDaysInMonth([{ start_date: '2026-11-10', end_date: '2026-11-10' }, { start_date: '2026-12-01', end_date: '2026-12-03' }], '2026-11-01'), 1);
});

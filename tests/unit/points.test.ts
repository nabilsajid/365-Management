import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_POINT_RULES,
  bonusAmount,
  dateInZone,
  dateTimeInZone,
  pointReason,
  monthStart,
  nextMonth,
  parseMonth,
  pointsToTarget,
  summarizeEntries,
} from '../../src/lib/domain/points';

test('default rules match the agreed structure', () => {
  assert.equal(DEFAULT_POINT_RULES.monthly_target, 1500);
  assert.equal(DEFAULT_POINT_RULES.attendance_points, 100);
  assert.equal(DEFAULT_POINT_RULES.bonus_step_points, 1000);
  assert.equal(DEFAULT_POINT_RULES.bonus_step_amount, 1000);
});

test('2,500 points earns a 1,000 bonus and 3,500 earns 2,000', () => {
  assert.equal(bonusAmount(2500, DEFAULT_POINT_RULES), 1000);
  assert.equal(bonusAmount(3500, DEFAULT_POINT_RULES), 2000);
});

test('no bonus until a full 1,000 points above the target', () => {
  assert.equal(bonusAmount(0, DEFAULT_POINT_RULES), 0);
  assert.equal(bonusAmount(1500, DEFAULT_POINT_RULES), 0);
  assert.equal(bonusAmount(2499, DEFAULT_POINT_RULES), 0);
  assert.equal(bonusAmount(-300, DEFAULT_POINT_RULES), 0);
});

test('points short of the next step do not carry into the bonus', () => {
  assert.equal(bonusAmount(3499, DEFAULT_POINT_RULES), 1000);
  assert.equal(bonusAmount(4500, DEFAULT_POINT_RULES), 3000);
});

test('bonus follows configured target, step and amount', () => {
  const rules = { ...DEFAULT_POINT_RULES, monthly_target: 1000, bonus_step_points: 500, bonus_step_amount: 750 };
  assert.equal(bonusAmount(2100, rules), 1500);
});

test('points to target never goes below zero', () => {
  assert.equal(pointsToTarget(400, DEFAULT_POINT_RULES), 1100);
  assert.equal(pointsToTarget(2600, DEFAULT_POINT_RULES), 0);
});

test('month boundaries follow the organization timezone, not UTC', () => {
  // 31 Oct 2026 19:30 UTC is already 1 Nov 01:30 in Dhaka (UTC+6).
  const at = new Date('2026-10-31T19:30:00Z');
  assert.equal(dateInZone(at, 'Asia/Dhaka'), '2026-11-01');
  assert.equal(monthStart(at, 'Asia/Dhaka'), '2026-11-01');
  assert.equal(monthStart(at, 'UTC'), '2026-10-01');
});

test('the first day of a month belongs to the new month', () => {
  assert.equal(monthStart(new Date('2026-11-30T17:59:59Z'), 'Asia/Dhaka'), '2026-11-01');
  assert.equal(monthStart(new Date('2026-11-30T18:00:00Z'), 'Asia/Dhaka'), '2026-12-01');
});

test('parseMonth accepts YYYY-MM and YYYY-MM-DD only', () => {
  assert.equal(parseMonth('2026-10'), '2026-10-01');
  assert.equal(parseMonth('2026-10-17'), '2026-10-01');
  assert.equal(parseMonth('2026-13'), null);
  assert.equal(parseMonth('October'), null);
  assert.equal(parseMonth(null), null);
});

test('nextMonth rolls over the year', () => {
  assert.equal(nextMonth('2026-11-01'), '2026-12-01');
  assert.equal(nextMonth('2026-12-01'), '2027-01-01');
});

test('a month summary keeps earnings and deductions apart', () => {
  const summary = summarizeEntries([{ points: 100 }, { points: 300 }, { points: -150 }]);
  assert.deepEqual(summary, { total: 250, earned: 400, deducted: -150 });
  assert.deepEqual(summarizeEntries([]), { total: 0, earned: 0, deducted: 0 });
});

test('timestamps are shown in the organization timezone, including the date', () => {
  // 22:16 UTC on the 12th is 04:16 on the 13th in Dhaka.
  const at = new Date('2026-11-12T22:16:30Z');
  assert.equal(dateTimeInZone(at, 'Asia/Dhaka'), '2026-11-13 04:16');
  assert.equal(dateTimeInZone(at, 'UTC'), '2026-11-12 22:16');
  assert.equal(dateTimeInZone(new Date('2026-11-12T18:00:00Z'), 'Asia/Dhaka'), '2026-11-13 00:00');
});

test('a point reason is the chosen reason plus any details', () => {
  assert.equal(pointReason('Extra time', ''), 'Extra time');
  assert.equal(pointReason('Good client feedback', '  Acme loved the cut '), 'Good client feedback: Acme loved the cut');
  assert.equal(pointReason('Other', 'Covered the weekend shoot'), 'Covered the weekend shoot');
  assert.equal(pointReason('Other', '  '), '');
});

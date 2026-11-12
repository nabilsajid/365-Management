import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bucketCashflow,
  lastMonths,
  mergeActivity,
  projectProgress,
  upcomingDeadlines,
  type ActivityItem,
} from '../../src/lib/domain/dashboard';

test('lastMonths lists months oldest first and crosses the year boundary', () => {
  assert.deepEqual(lastMonths('2026-11-01', 3), ['2026-09-01', '2026-10-01', '2026-11-01']);
  assert.deepEqual(lastMonths('2027-02-01', 4), ['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
  assert.deepEqual(lastMonths('2026-01-01', 1), ['2026-01-01']);
});

test('cash flow adds payments and expenses into their own months', () => {
  const points = bucketCashflow(
    ['2026-10-01', '2026-11-01'],
    [
      { amount: 20000, paid_on: '2026-10-05' },
      { amount: '5000.50', paid_on: '2026-10-28' },
      { amount: 7000, paid_on: '2026-11-02' },
      { amount: 99999, paid_on: '2026-08-15' },
    ],
    [
      { amount: 1200, expense_date: '2026-11-03' },
      { amount: null, expense_date: '2026-11-04' },
      { amount: 300, expense_date: '2026-12-01' },
    ],
  );
  assert.deepEqual(points, [
    { month: '2026-10-01', income: 25000.5, expenses: 0 },
    { month: '2026-11-01', income: 7000, expenses: 1200 },
  ]);
});

test('cash flow with no entries is all zeros', () => {
  assert.deepEqual(bucketCashflow(['2026-11-01'], [], []), [{ month: '2026-11-01', income: 0, expenses: 0 }]);
});

const projects = [
  { id: 'p1', name: 'Launch', status: 'active', due_date: '2026-11-20' },
  { id: 'p2', name: 'Onboarding', status: 'onboarding', due_date: null },
  { id: 'p3', name: 'Done', status: 'completed', due_date: '2026-11-01' },
];
const tasks = [
  { id: 't1', project_id: 'p1', title: 'Video 1', status: 'approved', due_date: '2026-11-05' },
  { id: 't2', project_id: 'p1', title: 'Video 2', status: 'submitted', due_date: '2026-11-10' },
  { id: 't3', project_id: 'p1', title: 'Video 3', status: 'todo', due_date: '2026-11-18' },
  { id: 't4', project_id: 'p3', title: 'Old', status: 'approved', due_date: null },
];

test('project progress counts approved deliverables for running projects only', () => {
  const progress = projectProgress(projects, tasks);
  assert.deepEqual(progress.map((row) => row.id), ['p1', 'p2']);
  assert.deepEqual(
    { total: progress[0].total, approved: progress[0].approved, percent: progress[0].percent },
    { total: 3, approved: 1, percent: 33 },
  );
  assert.equal(progress[1].percent, 0);
});

test('deadlines skip finished work, sort soonest first and flag overdue items', () => {
  const deadlines = upcomingDeadlines('2026-11-12', projects, tasks);
  assert.deepEqual(deadlines.map((item) => `${item.kind}:${item.title}`), [
    'task:Video 2',
    'task:Video 3',
    'project:Launch',
  ]);
  assert.equal(deadlines[0].overdue, true);
  assert.equal(deadlines[0].context, 'Launch');
  assert.equal(deadlines[1].overdue, false);
});

test('deadlines respect the limit', () => {
  assert.equal(upcomingDeadlines('2026-11-12', projects, tasks, 1).length, 1);
});

test('activity is merged newest first and limited', () => {
  const item = (id: string, at: string): ActivityItem => ({
    kind: 'payment', id, title: id, detail: null, amount: 1, at, href: '/cashflow',
  });
  const merged = mergeActivity([item('a', '2026-11-01T10:00:00Z'), item('b', '2026-11-03T10:00:00Z'), item('c', '2026-11-02T10:00:00Z')], 2);
  assert.deepEqual(merged.map((entry) => entry.id), ['b', 'c']);
});

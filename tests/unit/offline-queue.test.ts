import assert from 'node:assert/strict';
import { test } from 'node:test';
import { queueLabel } from '../../src/lib/offline-queue';

const ID = '11111111-1111-4111-8111-111111111111';

test('things that only add something may wait for a connection', () => {
  assert.equal(queueLabel('POST', '/api/attendance', { work_date: '2026-11-14' }), 'Attendance for 2026-11-14');
  assert.equal(queueLabel('POST', `/api/projects/${ID}/comments`, { body: 'Looks good' }), 'Project comment');
  assert.equal(queueLabel('POST', `/api/tasks/${ID}/submissions`, {}), 'Work submission');
  assert.equal(queueLabel('POST', '/api/expenses', { description: 'Client visit' }), 'Trip or cost: Client visit');
  assert.equal(queueLabel('POST', '/api/equipment-needs', { item_name: 'Tripod' }), 'Needed item: Tripod');
  assert.equal(queueLabel('post', '/api/broadcasts', { message: 'Need a battery' }), 'Broadcast');
});

test('edits, deletes, and anything about money, points, approvals or roles need a connection', () => {
  assert.equal(queueLabel('PATCH', `/api/tasks/${ID}`, { status: 'approved' }), null);
  assert.equal(queueLabel('DELETE', `/api/project-comments/${ID}`, undefined), null);
  assert.equal(queueLabel('PATCH', `/api/attendance/${ID}`, { status: 'verified' }), null);
  assert.equal(queueLabel('POST', '/api/points', { points: 500 }), null);
  assert.equal(queueLabel('POST', '/api/invoices', {}), null);
  assert.equal(queueLabel('POST', '/api/payments', {}), null);
  assert.equal(queueLabel('PATCH', `/api/change-requests/${ID}`, { decision: 'approve' }), null);
  assert.equal(queueLabel('POST', '/api/employees', {}), null);
  assert.equal(queueLabel('POST', '/api/projects', {}), null);
  assert.equal(queueLabel('POST', '/api/attendance/extra', {}), null);
});

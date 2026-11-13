import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNoticeActive, noticeExpiry, noticeTimeLeft, sortNotices } from '../../src/lib/domain/notices';
import { noticeCreate, profileUpdate } from '../../src/lib/validation';

const now = new Date('2026-11-14T06:00:00.000Z');

test('a notice expires after the chosen time, or never', () => {
  assert.equal(noticeExpiry('3d', now), '2026-11-17T06:00:00.000Z');
  assert.equal(noticeExpiry('1w', now), '2026-11-21T06:00:00.000Z');
  assert.equal(noticeExpiry('15d', now), '2026-11-29T06:00:00.000Z');
  assert.equal(noticeExpiry('1m', now), '2026-12-14T06:00:00.000Z');
  assert.equal(noticeExpiry('forever', now), null);
});

test('a notice shows until its expiry passes', () => {
  assert.ok(isNoticeActive(null, now));
  assert.ok(isNoticeActive('2026-11-14T06:00:01.000Z', now));
  assert.ok(!isNoticeActive('2026-11-14T06:00:00.000Z', now));
  assert.ok(!isNoticeActive('2026-11-01T00:00:00.000Z', now));
});

test('time left reads naturally', () => {
  assert.equal(noticeTimeLeft(null, now), 'Until deleted');
  assert.equal(noticeTimeLeft('2026-11-17T06:00:00.000Z', now), '3 days left');
  assert.equal(noticeTimeLeft('2026-11-15T07:00:00.000Z', now), '2 days left');
  assert.equal(noticeTimeLeft('2026-11-14T11:30:00.000Z', now), '5 hours left');
  assert.equal(noticeTimeLeft('2026-11-14T07:10:00.000Z', now), '1 hour left');
  assert.equal(noticeTimeLeft('2026-11-14T06:20:00.000Z', now), 'Less than an hour left');
  assert.equal(noticeTimeLeft('2026-11-13T06:00:00.000Z', now), 'Expired');
});

test('urgent notices come first, then the newest', () => {
  const sorted = sortNotices([
    { id: 'old', is_urgent: false, created_at: '2026-11-01T00:00:00Z' },
    { id: 'urgent', is_urgent: true, created_at: '2026-11-02T00:00:00Z' },
    { id: 'new', is_urgent: false, created_at: '2026-11-10T00:00:00Z' },
  ]);
  assert.deepEqual(sorted.map((notice) => notice.id), ['urgent', 'new', 'old']);
});

test('a notice needs a title and a known duration', () => {
  assert.ok(noticeCreate.safeParse({ title: 'Office closed', duration: '1w' }).success);
  assert.ok(noticeCreate.safeParse({ title: 'Rules', body: null, is_urgent: true, duration: 'forever' }).success);
  assert.ok(!noticeCreate.safeParse({ title: ' ', duration: '1w' }).success);
  assert.ok(!noticeCreate.safeParse({ title: 'Office closed', duration: '2y' }).success);
  assert.ok(!noticeCreate.safeParse({ title: 'Office closed' }).success);
});

test('a profile needs a name and a Bangladeshi mobile number', () => {
  const full = { full_name: 'Rafi Ahmed', nickname: 'Rafi', contact: '01700000001', address: 'Dhaka', secondary_contact: null };
  assert.ok(profileUpdate.safeParse(full).success);
  assert.ok(profileUpdate.safeParse({ full_name: 'Rafi Ahmed', contact: '01700000001' }).success);
  assert.equal(profileUpdate.parse({ ...full, contact: '017 0000-0001' }).contact, '01700000001');
  assert.ok(!profileUpdate.safeParse({ ...full, full_name: '' }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, contact: null }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, contact: 'call me' }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, contact: '0170000000' }).success, '10 digits');
  assert.ok(!profileUpdate.safeParse({ ...full, contact: '017000000012' }).success, '12 digits');
  assert.ok(!profileUpdate.safeParse({ ...full, contact: '02700000001' }).success, 'does not start with 01');
  assert.ok(!profileUpdate.safeParse({ ...full, contact: '+8801700000001' }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, secondary_contact: '12345' }).success);
  assert.ok(profileUpdate.safeParse({ ...full, secondary_contact: '01800000002' }).success);
});

test('view access and editing access are separate', async () => {
  const { canEdit, canSee, editSegmentsFromRoles, segmentsFromRoles } = await import('../../src/lib/domain/roles');
  const roles = [
    { permissions: ['equipment', 'costs'], edit_permissions: ['costs'] },
    { permissions: ['projects'], edit_permissions: [] },
  ];
  const viewer = { isAdmin: false, segments: segmentsFromRoles(roles), editSegments: editSegmentsFromRoles(roles) };
  assert.ok(canSee(viewer, 'equipment') && !canEdit(viewer, 'equipment'), 'view only');
  assert.ok(canSee(viewer, 'costs') && canEdit(viewer, 'costs'), 'view and edit');
  assert.ok(canSee(viewer, 'projects') && !canEdit(viewer, 'projects'));
  assert.ok(!canSee(viewer, 'cashflow') && !canEdit(viewer, 'cashflow'));
  assert.ok(canEdit({ isAdmin: true, editSegments: new Set() }, 'cashflow'), 'admins edit everything');
  // Before the database update there is no edit list: seeing a part still means editing it.
  assert.ok(editSegmentsFromRoles([{ permissions: ['bonuses'] }]).has('bonuses'));
});

test('a video knows where its thumbnail stands', async () => {
  const { buildDeliverableTasks, thumbnailState } = await import('../../src/lib/domain/deliverables');
  const tasks = [
    { id: 'v1', kind: 'video', status: 'todo' },
    { id: 'v2', kind: 'video', status: 'todo' },
    { id: 'v3', kind: 'video', status: 'todo' },
    { id: 't1', kind: 'thumbnail', for_task_id: 'v1', status: 'approved' },
    { id: 't2', kind: 'thumbnail', for_task_id: 'v2', status: 'in_progress' },
  ];
  assert.equal(thumbnailState('v1', tasks), 'approved');
  assert.equal(thumbnailState('v2', tasks), 'in_progress');
  assert.equal(thumbnailState('v3', tasks), 'missing');

  const rows = buildDeliverableTasks('org', 'project', [{ title: 'Shoot', kind: 'shoot' }, { title: 'Old style' }]);
  assert.equal(rows[0].kind, 'shoot');
  assert.ok(!('kind' in rows[1]), 'no type is sent when none was chosen');
});

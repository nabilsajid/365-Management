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

test('a profile needs a name and a real contact number', () => {
  const full = { full_name: 'Rafi Ahmed', nickname: 'Rafi', contact: '+880 1700-000001', address: 'Dhaka', secondary_contact: null };
  assert.ok(profileUpdate.safeParse(full).success);
  assert.ok(profileUpdate.safeParse({ full_name: 'Rafi Ahmed', contact: '01700000001' }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, full_name: '' }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, contact: null }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, contact: 'call me' }).success);
  assert.ok(!profileUpdate.safeParse({ ...full, secondary_contact: 'abc' }).success);
});

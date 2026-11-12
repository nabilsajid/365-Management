import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isReplayablePath, sectionOf } from '../../src/lib/domain/changes';
import { ROLE_COLORS, roleTags, titleTags } from '../../src/lib/domain/roles';
import { changeDecision, roleCreate } from '../../src/lib/validation';

const ID = '11111111-1111-1111-1111-111111111111';

test('only the app\'s own data routes can be replayed on approval', () => {
  assert.equal(isReplayablePath('/api/equipment'), true);
  assert.equal(isReplayablePath(`/api/expenses/${ID}`), true);
  assert.equal(isReplayablePath(`/api/fixed-expenses/${ID}`), true);
  assert.equal(isReplayablePath('/api/points'), true);
});

test('roles, people, settings and approvals themselves can never be changed by a request', () => {
  for (const path of [
    '/api/roles',
    `/api/roles/${ID}`,
    `/api/employees/${ID}`,
    '/api/point-settings',
    `/api/change-requests/${ID}`,
    '/api/bonuses/calculate',
    `/api/submissions/${ID}`,
    '/api/equipment/../roles',
    `/api/equipment/${ID}/extra`,
    'https://evil.example/api/equipment',
    '/auth/signout',
  ]) {
    assert.equal(isReplayablePath(path), false, path);
  }
});

test('a request is filed under the part of the app it changes', () => {
  assert.equal(sectionOf(`/api/equipment/${ID}`), 'Equipment');
  assert.equal(sectionOf('/api/points'), 'Points');
  assert.equal(sectionOf('/api/invoices'), 'Cash flow');
  assert.equal(sectionOf('/api/unknown'), 'Other');
});

test('a decision is approve or deny', () => {
  assert.equal(changeDecision.safeParse({ decision: 'approve' }).success, true);
  assert.equal(changeDecision.safeParse({ decision: 'deny', note: 'Too expensive' }).success, true);
  assert.equal(changeDecision.safeParse({ decision: 'maybe' }).success, false);
});

test('role colours come from a fixed palette', () => {
  assert.equal(ROLE_COLORS.length, 12);
  assert.equal(roleCreate.safeParse({ name: 'Writer', color: 'cyan' }).success, true);
  assert.equal(roleCreate.safeParse({ name: 'Writer', color: 'neon' }).success, false);
});

test('role names become coloured tags, sorted, skipping blanks', () => {
  const colors = new Map([['Admin', 'red'], ['Video Editor', 'purple']]);
  assert.deepEqual(roleTags(['Video Editor', null, 'Admin', 'Intern'], colors), [
    { label: 'Admin', color: 'red' },
    { label: 'Intern', color: undefined },
    { label: 'Video Editor', color: 'purple' },
  ]);
  assert.deepEqual(titleTags('Video Editor, Admin', colors).map((tag) => tag.label), ['Admin', 'Video Editor']);
  assert.deepEqual(titleTags(null, colors), []);
});

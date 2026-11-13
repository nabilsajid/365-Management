import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SEGMENT_KEYS, canSee, segmentLabel, segmentsFromRoles } from '../../src/lib/domain/roles';
import { navFor } from '../../src/components/shell/nav';
import { employeeCreate, employeeUpdate, roleCreate, roleUpdate } from '../../src/lib/validation';

const UUID = '11111111-1111-1111-1111-111111111111';

test('the segments match the ones the database accepts', () => {
  assert.deepEqual([...SEGMENT_KEYS], ['projects', 'equipment', 'costs', 'cashflow', 'team_points', 'bonuses']);
  assert.equal(segmentLabel('cashflow'), 'Cash flow');
  assert.equal(segmentLabel('unknown'), 'unknown');
});

test('several roles combine into one set of segments', () => {
  const segments = segmentsFromRoles([
    { permissions: ['projects'] },
    { permissions: ['cashflow', 'projects'] },
    { permissions: null },
  ]);
  assert.deepEqual([...segments].sort(), ['cashflow', 'projects']);
  assert.equal(segmentsFromRoles([]).size, 0);
});

test('admins see every segment; others only what their roles include', () => {
  const none = new Set<string>();
  assert.equal(canSee({ isAdmin: true, segments: none }, 'cashflow'), true);
  assert.equal(canSee({ isAdmin: false, segments: none }, 'cashflow'), false);
  assert.equal(canSee({ isAdmin: false, segments: new Set(['team_points']) }, 'team_points'), true);
  assert.equal(canSee({ isAdmin: false, segments: new Set(['team_points']) }, 'bonuses'), false);
});

const hrefs = (isAdmin: boolean, segments: string[]) =>
  navFor({ isAdmin, segments: new Set(segments) }).flatMap((group) => group.items.map((item) => item.href));

test('the sidebar only lists what a person can open', () => {
  assert.deepEqual(hrefs(false, []), ['/dashboard', '/notices', '/broadcasts', '/my-tasks', '/logistics', '/employees', '/profile', '/requests']);
  assert.deepEqual(hrefs(false, ['cashflow']), ['/dashboard', '/notices', '/broadcasts', '/my-tasks', '/cashflow', '/logistics', '/employees', '/profile', '/requests']);
  assert.ok(hrefs(false, ['projects']).includes('/projects'));
  assert.ok(!hrefs(false, ['projects', 'cashflow', 'team_points']).includes('/approvals'));
  assert.ok(!hrefs(false, ['projects', 'cashflow', 'team_points']).includes('/roles'));
  assert.ok(!hrefs(true, []).includes('/requests'));
  assert.deepEqual(hrefs(true, []), ['/dashboard', '/notices', '/broadcasts', '/projects', '/my-tasks', '/cashflow', '/logistics', '/employees', '/profile', '/approvals', '/roles']);
});

test('a role needs a name and only known segments', () => {
  assert.equal(roleCreate.safeParse({ name: 'Bookkeeper', permissions: ['cashflow', 'costs'] }).success, true);
  assert.equal(roleCreate.safeParse({ name: 'Intern' }).success, true);
  assert.equal(roleCreate.safeParse({ name: ' ', permissions: [] }).success, false);
  assert.equal(roleCreate.safeParse({ name: 'X', permissions: ['everything'] }).success, false);
  assert.ok(!('is_admin' in roleUpdate.parse({ name: 'X', is_admin: true })));
});

test('people are given one or more roles by id', () => {
  const base = { email: 'rafi@example.com', full_name: 'Rafi' };
  assert.equal(employeeCreate.safeParse({ ...base, role_ids: [UUID, UUID.replace(/1/g, '2')] }).success, true);
  assert.equal(employeeCreate.safeParse({ ...base, role_ids: [] }).success, false);
  assert.equal(employeeCreate.safeParse(base).success, false);
  assert.equal(employeeUpdate.safeParse({ role_ids: ['not-an-id'] }).success, false);
  assert.ok(!('access_role' in employeeUpdate.parse({ full_name: 'Rafi', access_role: 'admin' })));
});

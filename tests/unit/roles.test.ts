import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JOB_ROLES, accessForRole, isJobRole } from '../../src/lib/domain/roles';
import { employeeInvite, employeeUpdate } from '../../src/lib/validation';
import { employees } from '../../src/lib/api/resources';
import type { ApiContext } from '../../src/lib/api/crud';

test('the role list is the agreed one', () => {
  assert.deepEqual([...JOB_ROLES], [
    'Graphic Designer',
    'Senior Graphic Designer',
    'Video Editor',
    'Senior Visualizer',
    'Project Manager',
    'Finance Manager',
    'Human Resource',
    'Logistics Manager',
    'Operations Manager',
    'Admin',
  ]);
});

test('only the Admin role gets admin access', () => {
  assert.equal(accessForRole('Admin'), 'admin');
  for (const role of JOB_ROLES.filter((value) => value !== 'Admin')) {
    assert.equal(accessForRole(role), 'employee', role);
  }
  assert.equal(accessForRole(null), 'employee');
  assert.equal(accessForRole('admin'), 'employee');
});

test('isJobRole rejects anything outside the list', () => {
  assert.equal(isJobRole('Video Editor'), true);
  assert.equal(isJobRole('Founder'), false);
  assert.equal(isJobRole(undefined), false);
});

test('inviting someone needs a role from the list', () => {
  const base = { email: 'rafi@example.com', full_name: 'Rafi' };
  assert.equal(employeeInvite.safeParse({ ...base, job_title: 'Logistics Manager' }).success, true);
  assert.equal(employeeInvite.safeParse({ ...base, job_title: 'Chief Wizard' }).success, false);
  assert.equal(employeeInvite.safeParse(base).success, false);
});

test('access cannot be set directly; it follows the role', () => {
  const parsed = employeeUpdate.parse({ job_title: 'Graphic Designer', access_role: 'admin' });
  assert.ok(!('access_role' in parsed));

  const ctx = {} as ApiContext;
  assert.deepEqual(employees.onUpdate?.(ctx, { job_title: 'Admin' }), { access_role: 'admin' });
  assert.deepEqual(employees.onUpdate?.(ctx, { job_title: 'Finance Manager' }), { access_role: 'employee' });
  assert.deepEqual(employees.onUpdate?.(ctx, { full_name: 'Renamed' }), {});
});

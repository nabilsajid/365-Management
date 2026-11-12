// Job roles a person can hold. The role is shown next to their name everywhere.
// "Admin" is the only role with full edit access; every other role is an employee.

export const JOB_ROLES = [
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
] as const;

export type JobRole = (typeof JOB_ROLES)[number];

export const ADMIN_ROLE: JobRole = 'Admin';

export function isJobRole(value: unknown): value is JobRole {
  return typeof value === 'string' && (JOB_ROLES as readonly string[]).includes(value);
}

/** Access level that goes with a job role. */
export function accessForRole(role: unknown): 'admin' | 'employee' {
  return role === ADMIN_ROLE ? 'admin' : 'employee';
}

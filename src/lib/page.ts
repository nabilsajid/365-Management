import { redirect } from 'next/navigation';
import { getApiContext } from '@/lib/api/context';
import type { Profile } from '@/types/database';
import type { Option, Row } from '@/components/types';

/** Context for a signed-in page; sends everyone else to the login page. */
export async function getPageContext() {
  const ctx = await getApiContext();
  if (!ctx) redirect('/login?reason=no-access');
  return { ...ctx, orgId: ctx.profile.org_id, isAdmin: ctx.profile.access_role === 'admin' };
}

export function personLabel(person: Pick<Profile, 'full_name' | 'job_title'>): string {
  return person.job_title ? `${person.full_name} (${person.job_title})` : person.full_name;
}

export function peopleOptions(people: Profile[]): Option[] {
  return people.filter((person) => person.is_active).map((person) => ({ value: person.id, label: personLabel(person) }));
}

export function options<T extends { id: string }>(rows: T[], labelOf: (row: T) => string): Option[] {
  return rows.map((row) => ({ value: row.id, label: labelOf(row) }));
}

export function enumOptions(values: readonly string[]): Option[] {
  return values.map((value) => ({
    value,
    label: (value.charAt(0).toUpperCase() + value.slice(1)).replace(/_/g, ' '),
  }));
}

/** Supabase returns untyped rows; this narrows them once for the tables. */
export function rowsOf<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

export function asRows(rows: object[]): Row[] {
  return rows as Row[];
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { cache } from 'react';
import type { MonthlyPoints, PointSettings, Profile } from '../../types/database';
import { DEFAULT_POINT_RULES, bonusAmount, pointsToTarget, type PointRules } from '../domain/points';

interface Org {
  name: string;
  timezone: string;
}

// Per-request store. The sign-in lookup already reads the organization along
// with the profile and leaves it here, so pages do not ask the database again.
const orgStore = cache(() => new Map<string, Org>());

export function primeOrg(orgId: string, org: Org): void {
  orgStore().set(orgId, org);
}

/** The organization's name and timezone. Cached, so a page and its layout share one lookup. */
export const getOrg = cache(async (supabase: SupabaseClient, orgId: string): Promise<Org> => {
  const known = orgStore().get(orgId);
  if (known) return known;
  const { data } = await supabase.from('organizations').select('name, timezone').eq('id', orgId).maybeSingle();
  return {
    name: (data?.name as string | undefined) ?? '365 Management',
    timezone: (data?.timezone as string | undefined) ?? 'Asia/Dhaka',
  };
});

export async function getOrgTimezone(supabase: SupabaseClient, orgId: string): Promise<string> {
  return (await getOrg(supabase, orgId)).timezone;
}

export async function getPointRules(supabase: SupabaseClient, orgId: string): Promise<PointRules> {
  const { data } = await supabase.from('point_settings').select('*').eq('org_id', orgId).maybeSingle();
  const settings = data as PointSettings | null;
  if (!settings) return DEFAULT_POINT_RULES;
  return {
    monthly_target: settings.monthly_target,
    attendance_points: settings.attendance_points,
    default_task_points: settings.default_task_points,
    bonus_step_points: settings.bonus_step_points,
    bonus_step_amount: Number(settings.bonus_step_amount),
  };
}

export interface EmployeeMonth {
  employee_id: string;
  full_name: string;
  job_title: string | null;
  total: number;
  earned: number;
  deducted: number;
  to_target: number;
  projected_bonus: number;
}

/** Each active person's standing for a month, from already-loaded people and totals. */
export function buildMonthlySummary(people: Profile[], totals: MonthlyPoints[], rules: PointRules): EmployeeMonth[] {
  const byEmployee = new Map<string, MonthlyPoints>();
  for (const row of totals) byEmployee.set(row.employee_id, row);

  return people
    .filter((person) => person.is_active)
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .map((person) => {
      const row = byEmployee.get(person.id);
      const total = row?.total_points ?? 0;
      return {
        employee_id: person.id,
        full_name: person.full_name,
        job_title: person.job_title,
        total,
        earned: row?.earned_points ?? 0,
        deducted: row?.deducted_points ?? 0,
        to_target: pointsToTarget(total, rules),
        projected_bonus: bonusAmount(total, rules),
      };
    });
}

/**
 * Everyone's standing for one month. Row level security decides whose rows
 * come back: an admin gets the whole team, an employee only themselves.
 */
export async function getMonthlySummary(
  supabase: SupabaseClient,
  orgId: string,
  month: string,
  rules: PointRules,
): Promise<EmployeeMonth[]> {
  const [people, totals] = await Promise.all([
    supabase.from('profiles').select('*').eq('org_id', orgId).eq('is_active', true).order('full_name'),
    supabase.from('monthly_points').select('*').eq('org_id', orgId).eq('period_month', month),
  ]);
  return buildMonthlySummary((people.data ?? []) as Profile[], (totals.data ?? []) as MonthlyPoints[], rules);
}

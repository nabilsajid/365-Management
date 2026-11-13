// Monthly points rules. Pure functions only, mirrored by the SQL in
// supabase/migrations/20261112000004_rewards.sql.

export interface PointRules {
  monthly_target: number;
  attendance_points: number;
  default_task_points: number;
  bonus_step_points: number;
  bonus_step_amount: number;
}

export const DEFAULT_POINT_RULES: PointRules = {
  monthly_target: 1500,
  attendance_points: 100,
  default_task_points: 0,
  bonus_step_points: 1000,
  bonus_step_amount: 1000,
};

/** Calendar date (YYYY-MM-DD) of an instant in a timezone. */
export function dateInZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Date and time (YYYY-MM-DD HH:MM, 24-hour) of an instant in a timezone. */
export function dateTimeInZone(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${dateInZone(at, timeZone)} ${get('hour')}:${get('minute')}`;
}

/** First day (YYYY-MM-01) of the month an instant falls in, in a timezone. */
export function monthStart(at: Date, timeZone: string): string {
  return `${dateInZone(at, timeZone).slice(0, 7)}-01`;
}

/** Accepts YYYY-MM or YYYY-MM-DD and returns YYYY-MM-01, or null if invalid. */
export function parseMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})(?:-\d{2})?$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return `${match[1]}-${match[2]}-01`;
}

/** First day of the following month, for date range queries. */
export function nextMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return m === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(m + 1).padStart(2, '0')}-01`;
}

/**
 * Bonus for a month's total: one step amount for every full step of points
 * above the target. With the defaults, 2,500 points earns 1,000 and 3,500
 * earns 2,000. Points short of a full step expire with the month.
 */
export function bonusAmount(totalPoints: number, rules: PointRules): number {
  const above = totalPoints - rules.monthly_target;
  if (above < rules.bonus_step_points) return 0;
  return Math.floor(above / rules.bonus_step_points) * rules.bonus_step_amount;
}

export function pointsToTarget(totalPoints: number, rules: PointRules): number {
  return Math.max(0, rules.monthly_target - totalPoints);
}

export interface MonthSummary {
  total: number;
  earned: number;
  deducted: number;
}

export function summarizeEntries(entries: { points: number }[]): MonthSummary {
  let earned = 0;
  let deducted = 0;
  for (const entry of entries) {
    if (entry.points > 0) earned += entry.points;
    else deducted += entry.points;
  }
  return { total: earned + deducted, earned, deducted };
}

/** Ready-made reasons offered when giving points. "Other" asks for the reason in words. */
export const POINT_REASONS = [
  'Extra time',
  'Client onboarded',
  'Good client feedback',
  'Finished ahead of deadline',
  'Helped a teammate',
  'Other',
] as const;

/** The reason stored with a point entry: the chosen reason, plus any details. */
export function pointReason(preset: string, details: string): string {
  const note = details.trim();
  if (preset === 'Other' || !preset) return note;
  return note ? `${preset}: ${note}` : preset;
}

/** Kinds of leave. Casual and sick come out of a yearly allowance; unpaid is taken off the payslip. */
export const LEAVE_KINDS = ['casual', 'sick', 'unpaid', 'other'] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number];

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  casual: 'Casual leave',
  sick: 'Sick leave',
  unpaid: 'Unpaid leave',
  other: 'Other',
};

/** Kinds with a yearly allowance. */
export const COUNTED_KINDS = ['casual', 'sick'] as const;
export type CountedKind = (typeof COUNTED_KINDS)[number];
export const DEFAULT_ALLOWANCE: Record<CountedKind, number> = { casual: 10, sick: 14 };

/** The yearly allowance a company set (Leave → Yearly allowance), or the defaults. */
export function leaveAllowance(settings: unknown): Record<CountedKind, number> {
  const raw = ((settings as { leave_allowance?: Record<string, unknown> } | null)?.leave_allowance ?? {}) as Record<string, unknown>;
  const result = { ...DEFAULT_ALLOWANCE };
  for (const kind of COUNTED_KINDS) {
    const value = Number(raw[kind]);
    if (Number.isInteger(value) && value >= 0 && value <= 365) result[kind] = value;
  }
  return result;
}

/** Days of a leave that fall inside a calendar year. */
export function daysInYear(row: { start_date: string; end_date: string }, year: number): number {
  const from = Math.max(Date.parse(`${year}-01-01T00:00:00Z`), Date.parse(`${row.start_date}T00:00:00Z`));
  const to = Math.min(Date.parse(`${year}-12-31T00:00:00Z`), Date.parse(`${row.end_date}T00:00:00Z`));
  return to < from ? 0 : Math.round((to - from) / 86400000) + 1;
}

export interface LeaveBalance {
  kind: CountedKind;
  allowance: number;
  used: number;
  left: number;
}

/** A person's casual and sick days used and left in a year, from their approved leave. */
export function leaveBalances(
  requests: { kind?: string | null; status: string; start_date: string; end_date: string }[],
  allowance: Record<CountedKind, number>,
  year: number,
): LeaveBalance[] {
  return COUNTED_KINDS.map((kind) => {
    const used = requests
      .filter((row) => row.status === 'approved' && (row.kind ?? 'casual') === kind)
      .reduce((sum, row) => sum + daysInYear(row, year), 0);
    return { kind, allowance: allowance[kind], used, left: Math.max(0, allowance[kind] - used) };
  });
}

/** What unpaid days cost on a payslip: a day is the monthly salary over 30. */
export function unpaidLeaveDeduction(monthlySalary: number, days: number): number {
  return Math.round((Number(monthlySalary) / 30) * days * 100) / 100;
}

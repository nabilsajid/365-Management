/** One payslip's figures. */
export interface PayslipFigures {
  base_salary: number;
  bonus: number;
  additions: number;
  deductions: number;
}

/** Take-home pay: salary plus bonus and additions, less deductions, never below zero. */
export function netPay(slip: PayslipFigures): number {
  const total = Number(slip.base_salary) + Number(slip.bonus) + Number(slip.additions) - Number(slip.deductions);
  return Math.max(0, Math.round(total * 100) / 100);
}

/** Days of approved leave falling inside the month that starts on `month` (YYYY-MM-01). */
export function leaveDaysInMonth(leave: { start_date: string; end_date: string }[], month: string): number {
  const start = Date.parse(`${month}T00:00:00Z`);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = next.getTime() - 86400000;
  let days = 0;
  for (const row of leave) {
    const from = Math.max(start, Date.parse(`${row.start_date}T00:00:00Z`));
    const to = Math.min(last, Date.parse(`${row.end_date}T00:00:00Z`));
    if (to >= from) days += Math.round((to - from) / 86400000) + 1;
  }
  return days;
}

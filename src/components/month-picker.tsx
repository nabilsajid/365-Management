'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTransition } from 'react';

function label(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** The `count` months ending with `current` (YYYY-MM), newest first. */
export function recentMonths(current: string, count: number): string[] {
  const year = Number(current.slice(0, 4));
  const index = Number(current.slice(5, 7)) - 1;
  const months: string[] = [];
  for (let back = 0; back < count; back += 1) {
    const total = year * 12 + index - back;
    months.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Month chooser that updates the page as soon as a month is picked: no extra
 * button to press. `keep` lists other query parameters to carry along, such as
 * the open tab.
 */
export function MonthPicker({
  value,
  current,
  keep = {},
  allowAll = false,
  count = 36,
}: {
  /** Selected month as YYYY-MM, or '' for "All months". */
  value: string;
  /** The current month as YYYY-MM; the newest one offered. */
  current: string;
  keep?: Record<string, string>;
  allowAll?: boolean;
  count?: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, startTransition] = useTransition();

  const months = recentMonths(current, count);
  // An older month reached by a link stays selectable.
  if (value && !months.includes(value)) months.push(value);

  function choose(month: string) {
    const params = new URLSearchParams(keep);
    if (month) params.set('month', month);
    const query = params.toString();
    startTransition(() => router.push(query ? `${pathname}?${query}` : pathname));
  }

  return (
    <label className="field month-select">
      <span>{loading ? 'Loading…' : 'Month'}</span>
      <select value={value} onChange={(event) => choose(event.target.value)} aria-busy={loading}>
        {allowAll ? <option value="">All months</option> : null}
        {months.map((month) => (
          <option key={month} value={month}>
            {label(month)}
            {month === current ? ' (current)' : ''}
          </option>
        ))}
      </select>
    </label>
  );
}

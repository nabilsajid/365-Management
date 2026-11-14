// Building a month calendar: the weeks to show and which events fall on each day.

export interface CalendarEvent {
  id: string;
  kind: 'task' | 'deadline' | 'shoot' | 'leave';
  title: string;
  /** First and last day, YYYY-MM-DD. One-day events have the same start and end. */
  start: string;
  end: string;
  href?: string;
  done?: boolean;
  /** Extra line, such as who it is assigned to. */
  detail?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** The weeks (Monday to Sunday) that cover a month, as YYYY-MM-DD strings. `month` is YYYY-MM-01. */
export function monthGrid(month: string): string[][] {
  const first = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  const end = new Date(last);
  end.setUTCDate(last.getUTCDate() + (6 - ((last.getUTCDay() + 6) % 7)));

  const weeks: string[][] = [];
  for (const day = new Date(start); day <= end; day.setUTCDate(day.getUTCDate() + 1)) {
    if (weeks.length === 0 || weeks[weeks.length - 1].length === 7) weeks.push([]);
    weeks[weeks.length - 1].push(iso(day));
  }
  return weeks;
}

/** The events on one day, in a fixed order: leave and shoots first, then deadlines, then tasks. */
export function eventsOn(day: string, events: CalendarEvent[]): CalendarEvent[] {
  const order = { leave: 0, shoot: 1, deadline: 2, task: 3 } as const;
  return events
    .filter((event) => event.start <= day && day <= event.end)
    .sort((a, b) => order[a.kind] - order[b.kind] || a.title.localeCompare(b.title));
}

export function shiftMonth(month: string, by: number): string {
  const date = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return iso(date);
}

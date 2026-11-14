// Where each person's points for a month came from.

export interface StatementEntry {
  employee_id: string;
  points: number;
  source: string;
  reason: string | null;
}

export interface Statement {
  attendance: number;
  tasks: number;
  projects: number;
  given: number;
  deducted: number;
  total: number;
}

const empty = (): Statement => ({ attendance: 0, tasks: 0, projects: 0, given: 0, deducted: 0, total: 0 });

/** Points per person, split by where they came from. Deductions are shown as a negative number. */
export function pointsStatement(entries: StatementEntry[]): Map<string, Statement> {
  const byPerson = new Map<string, Statement>();
  for (const entry of entries) {
    const row = byPerson.get(entry.employee_id) ?? empty();
    if (entry.points < 0) row.deducted += entry.points;
    else if (entry.source === 'attendance') row.attendance += entry.points;
    else if (entry.source === 'task') row.tasks += entry.points;
    else if ((entry.reason ?? '').startsWith('Project completed')) row.projects += entry.points;
    else row.given += entry.points;
    row.total += entry.points;
    byPerson.set(entry.employee_id, row);
  }
  return byPerson;
}

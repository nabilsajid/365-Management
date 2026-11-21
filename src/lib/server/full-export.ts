import type { SupabaseClient } from '@supabase/supabase-js';
import type { CellValue, Sheet } from '@/lib/server/xlsx';

/** The company's records that go into a full export or a backup, one sheet each. */
export const EXPORT_TABLES: { table: string; sheet: string }[] = [
  { table: 'clients', sheet: 'Clients' },
  { table: 'projects', sheet: 'Projects' },
  { table: 'project_months', sheet: 'Project months' },
  { table: 'project_targets', sheet: 'Fixed deliverables' },
  { table: 'project_members', sheet: 'Project members' },
  { table: 'tasks', sheet: 'Deliverables' },
  { table: 'task_submissions', sheet: 'Submissions' },
  { table: 'task_comments', sheet: 'Deliverable comments' },
  { table: 'project_comments', sheet: 'Project comments' },
  { table: 'invoices', sheet: 'Invoices' },
  { table: 'payments', sheet: 'Payments' },
  { table: 'accounts', sheet: 'Accounts' },
  { table: 'expenses', sheet: 'Costs' },
  { table: 'fixed_expenses', sheet: 'Fixed costs' },
  { table: 'investors', sheet: 'Investors' },
  { table: 'investments', sheet: 'Investments' },
  { table: 'profiles', sheet: 'Team' },
  { table: 'roles', sheet: 'Roles' },
  { table: 'profile_roles', sheet: 'Role assignments' },
  { table: 'salaries', sheet: 'Salaries' },
  { table: 'payslips', sheet: 'Payslips' },
  { table: 'salary_advances', sheet: 'Salary advances' },
  { table: 'advance_repayments', sheet: 'Advance repayments' },
  { table: 'leave_requests', sheet: 'Leave' },
  { table: 'attendance', sheet: 'Attendance' },
  { table: 'point_entries', sheet: 'Points' },
  { table: 'bonuses', sheet: 'Bonuses' },
  { table: 'violation_types', sheet: 'Point rules' },
  { table: 'equipment', sheet: 'Equipment' },
  { table: 'equipment_checkouts', sheet: 'Equipment use' },
  { table: 'equipment_needs', sheet: 'Equipment needs' },
  { table: 'notices', sheet: 'Notices' },
  { table: 'client_feedback', sheet: 'Client feedback' },
  { table: 'change_requests', sheet: 'Change requests' },
];

// Never exported: sign-in secrets, links that open a portal, pictures.
const SECRET = /token|secret|password|encrypted|hash|photo_data|image_data|data_url/i;
const PAGE = 1000;
const MAX_ROWS = 50000;

export type ExportData = Record<string, Record<string, unknown>[]>;

/** Every export table's rows for one company. Tables not there yet are left out. */
export async function collectCompanyData(db: SupabaseClient, orgId: string): Promise<ExportData> {
  const data: ExportData = {};
  await Promise.all(
    EXPORT_TABLES.map(async ({ table }) => {
      const rows: Record<string, unknown>[] = [];
      for (let from = 0; from < MAX_ROWS; from += PAGE) {
        const { data: page, error } = await db.from(table).select('*').eq('org_id', orgId).range(from, from + PAGE - 1);
        if (error) return;
        rows.push(...((page ?? []) as Record<string, unknown>[]));
        if ((page ?? []).length < PAGE) break;
      }
      data[table] = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !SECRET.test(key) && key !== 'org_id')));
    }),
  );
  return data;
}

export function rowCount(data: ExportData): number {
  return Object.values(data).reduce((sum, rows) => sum + rows.length, 0);
}

function cell(value: unknown): CellValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  // Amounts come back from the database as text; keep them numbers in Excel.
  return /^-?\d+(\.\d+)?$/.test(text) && text.length < 16 ? Number(text) : text;
}

/** One sheet per table, with every column. Empty tables still get their sheet. */
export function exportSheets(data: ExportData): Sheet[] {
  return EXPORT_TABLES.filter(({ table }) => table in data).map(({ table, sheet }) => {
    const rows = data[table] ?? [];
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return {
      name: sheet,
      widths: columns.map((column) => (column === 'id' || column.endsWith('_id') ? 38 : 18)),
      rows: [columns.length > 0 ? columns : ['(empty)'], ...rows.map((row) => columns.map((column) => cell(row[column])))],
    };
  });
}

// Spreadsheet-friendly CSV: a byte-order mark so Excel reads Bangla and other
// text correctly, quoted values, and cells that cannot be run as formulas.

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  // A leading =, +, - or @ would make a spreadsheet treat text as a formula.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(header: string[], rows: CsvValue[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** The first and the day after the last day of a YYYY-MM month, or null for a bad month. */
export function monthRange(month: string): { from: string; until: string } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;
  const year = Number(match[1]);
  const index = Number(match[2]);
  if (index < 1 || index > 12) return null;
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, until: `${next}-01` };
}

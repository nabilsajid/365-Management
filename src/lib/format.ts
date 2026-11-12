export function money(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '—';
  return `৳${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function label(value: string | null | undefined): string {
  if (!value) return '—';
  const text = value.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function monthLabel(month: string): string {
  const date = new Date(`${month.slice(0, 7)}-01T00:00:00Z`);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// How long a notice stays on the notice board and the dashboard.

export const NOTICE_DURATIONS = [
  { value: '3d', label: '3 days', days: 3 },
  { value: '1w', label: '1 week', days: 7 },
  { value: '15d', label: '15 days', days: 15 },
  { value: '1m', label: '1 month', days: 30 },
  { value: 'forever', label: 'Until deleted', days: null },
] as const;

export type NoticeDuration = (typeof NOTICE_DURATIONS)[number]['value'];
export const NOTICE_DURATION_VALUES = NOTICE_DURATIONS.map((option) => option.value) as [NoticeDuration, ...NoticeDuration[]];

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** When a notice posted now stops showing; null means it stays until deleted. */
export function noticeExpiry(duration: NoticeDuration, now: Date): string | null {
  const days = NOTICE_DURATIONS.find((option) => option.value === duration)?.days ?? null;
  return days === null ? null : new Date(now.getTime() + days * DAY).toISOString();
}

export function isNoticeActive(expiresAt: string | null, now: Date): boolean {
  return expiresAt === null || new Date(expiresAt).getTime() > now.getTime();
}

/** "Until deleted", "3 days left", "5 hours left" or "Expired". */
export function noticeTimeLeft(expiresAt: string | null, now: Date): string {
  if (expiresAt === null) return 'Until deleted';
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (left <= 0) return 'Expired';
  if (left < HOUR) return 'Less than an hour left';
  if (left < DAY) {
    const hours = Math.floor(left / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} left`;
  }
  const days = Math.ceil(left / DAY);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/** Urgent notices first, then the newest. */
export function sortNotices<T extends { is_urgent: boolean; created_at: string }>(notices: T[]): T[] {
  return [...notices].sort(
    (a, b) => Number(b.is_urgent) - Number(a.is_urgent) || b.created_at.localeCompare(a.created_at),
  );
}

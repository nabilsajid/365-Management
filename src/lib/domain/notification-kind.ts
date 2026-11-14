// Which kind a notification is, from the page it points to. People can turn
// each kind off; the pop-up and device alerts follow their choice.

export type NotificationKind = 'assignments' | 'updates' | 'approvals';

export function notificationKind(href: string | null | undefined): NotificationKind {
  const path = href ?? '';
  if (path.startsWith('/approvals') || path.includes('#award')) return 'approvals';
  if (path.startsWith('/tasks') || path.startsWith('/projects')) return 'assignments';
  return 'updates';
}

/** Whether a person wants this notification. Anything not switched off is wanted. */
export function wants(prefs: unknown, href: string | null | undefined): boolean {
  if (!prefs || typeof prefs !== 'object') return true;
  return (prefs as Record<string, unknown>)[notificationKind(href)] !== false;
}

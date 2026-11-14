// Things done without a connection wait here, on the device, and are sent in
// order when the connection returns. Only actions that ADD something are
// allowed to wait: two people adding things never overwrite each other, so
// nothing needs merging. Edits to existing records, and anything about money,
// points, approvals, roles or passwords, need a connection.

export interface QueuedAction {
  id: string;
  /** Who did it. A different person signing in on this device never sends it. */
  userId: string;
  method: string;
  endpoint: string;
  body: unknown;
  /** What to call it in the list: "Attendance for 2026-11-14". */
  label: string;
  at: string;
}

export interface FailedAction {
  id: string;
  userId: string;
  label: string;
  reason: string;
  at: string;
}

const QUEUE_KEY = 'offline-queue-v1';
const FAILED_KEY = 'offline-failed-v1';
export const QUEUE_EVENT = 'offline-queue:change';
const WEEK = 7 * 24 * 60 * 60 * 1000;

const RULES: { method: string; path: RegExp; label: (body: Record<string, unknown>) => string }[] = [
  { method: 'POST', path: /^\/api\/attendance$/, label: (body) => `Attendance for ${String(body.work_date ?? 'today')}` },
  { method: 'POST', path: /^\/api\/projects\/[0-9a-f-]{36}\/comments$/, label: () => 'Project comment' },
  { method: 'POST', path: /^\/api\/tasks\/[0-9a-f-]{36}\/submissions$/, label: () => 'Work submission' },
  { method: 'POST', path: /^\/api\/expenses$/, label: (body) => `Trip or cost: ${String(body.description ?? '')}`.trim() },
  { method: 'POST', path: /^\/api\/equipment-needs$/, label: (body) => `Needed item: ${String(body.item_name ?? '')}`.trim() },
  { method: 'POST', path: /^\/api\/broadcasts$/, label: () => 'Broadcast' },
];

/** The label for an action that may wait for a connection, or null when it needs one now. */
export function queueLabel(method: string, endpoint: string, body: unknown): string | null {
  const path = endpoint.split('?')[0];
  const rule = RULES.find((item) => item.method === method.toUpperCase() && item.path.test(path));
  return rule ? rule.label((body ?? {}) as Record<string, unknown>) : null;
}

let currentUser = '';
/** Set by the signed-in layout, so waiting actions are tied to the person who made them. */
export function setQueueUser(userId: string): void {
  currentUser = userId;
}

function read<T>(key: string): T[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write(key: string, items: unknown[]): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    window.dispatchEvent(new Event(QUEUE_EVENT));
    return true;
  } catch {
    return false;
  }
}

const fresh = <T extends { at: string }>(items: T[]) => items.filter((item) => Date.now() - new Date(item.at).getTime() < WEEK);

/** Keeps an action for later. False when it could not be kept (no signed-in person, or the device refused). */
export function enqueue(method: string, endpoint: string, body: unknown, label: string): boolean {
  if (!currentUser) return false;
  const id = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const item: QueuedAction = { id, userId: currentUser, method, endpoint, body, label, at: new Date().toISOString() };
  return write(QUEUE_KEY, [...fresh(read<QueuedAction>(QUEUE_KEY)), item]);
}

export function waiting(userId: string): QueuedAction[] {
  return fresh(read<QueuedAction>(QUEUE_KEY)).filter((item) => item.userId === userId);
}

export function failures(userId: string): FailedAction[] {
  return fresh(read<FailedAction>(FAILED_KEY)).filter((item) => item.userId === userId);
}

export function clearFailures(userId: string): void {
  write(FAILED_KEY, read<FailedAction>(FAILED_KEY).filter((item) => item.userId !== userId));
}

/**
 * Sends this person's waiting actions, oldest first. An action the server
 * turns down (a day already marked, a project deleted meanwhile) is dropped
 * and listed with the reason. If the connection fails again, the rest wait.
 */
export async function flush(userId: string): Promise<{ sent: number; rejected: number }> {
  let sent = 0;
  let rejected = 0;
  for (const item of waiting(userId)) {
    let response: Response;
    try {
      response = await fetch(item.endpoint, {
        method: item.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
    } catch {
      break; // Still no connection.
    }
    // Not signed in, or the server is having trouble: keep it and try again later.
    if (response.status === 401 || response.status >= 500) break;

    write(QUEUE_KEY, read<QueuedAction>(QUEUE_KEY).filter((other) => other.id !== item.id));
    if (response.ok) {
      sent += 1;
    } else {
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      const reason = payload?.error?.message ?? `The server did not accept it (${response.status}).`;
      write(FAILED_KEY, [...fresh(read<FailedAction>(FAILED_KEY)), { id: item.id, userId, label: item.label, reason, at: new Date().toISOString() }]);
      rejected += 1;
    }
  }
  return { sent, rejected };
}

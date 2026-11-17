// Turning a project brief's deliverables into one task each.

export interface FileLinkInput {
  label: string;
  url: string;
}

export interface DeliverableInput {
  title: string;
  description?: string | null;
  file_links?: FileLinkInput[];
  assignee_id?: string | null;
  points_value?: number | null;
  due_date?: string | null;
  kind?: string | null;
  /** For a thumbnail: the position, in the same list, of the video it belongs to. */
  for_index?: number | null;
  /** In a monthly project's package: the day of the month it is due. */
  due_day?: number | null;
}

/** Rows for a monthly project's package, from the deliverables given when it was created. */
export function buildPackageItems(orgId: string, projectId: string, deliverables: DeliverableInput[]) {
  return deliverables.map((deliverable, index) => ({
    org_id: orgId,
    project_id: projectId,
    title: deliverable.title.trim(),
    description: deliverable.description?.trim() || null,
    kind: deliverable.kind || 'other',
    assignee_id: deliverable.assignee_id ?? null,
    points_value: deliverable.points_value ?? null,
    due_day: deliverable.due_day ?? null,
    position: index,
  }));
}

/** The first day of the month after the given YYYY-MM-01. */
export function nextMonthStart(month: string): string {
  const [year, index] = month.split('-').map(Number);
  return index === 12 ? `${year + 1}-01-01` : `${year}-${String(index + 1).padStart(2, '0')}-01`;
}

/** What a deliverable is. The order here is the order the groups appear on a project. */
export const TASK_KINDS = ['shoot', 'video', 'thumbnail', 'photo', 'post', 'graphic', 'other'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  shoot: 'Shoots',
  video: 'Videos',
  thumbnail: 'Thumbnails',
  photo: 'Photos',
  post: 'Social media posts',
  graphic: 'Graphics',
  other: 'Other deliverables',
};
export const TASK_KIND_SINGLE: Record<TaskKind, string> = {
  shoot: 'Shoot',
  video: 'Video',
  thumbnail: 'Thumbnail',
  photo: 'Photo',
  post: 'Social media post',
  graphic: 'Graphic',
  other: 'Other',
};

/** "5 videos", "1 social media post": a count with the type's name. */
export function countOf(kind: TaskKind, count: number): string {
  const single = TASK_KIND_SINGLE[kind].toLowerCase();
  return `${count} ${count === 1 ? single : TASK_KIND_LABEL[kind].toLowerCase().replace('other deliverables', 'other')}`;
}

export interface DeliveryCount {
  kind: TaskKind;
  /** The monthly target, or null when the client has no fixed number for this type. */
  target: number | null;
  delivered: number;
  inReview: number;
  /** All of this type in the month, finished or not. */
  total: number;
}

/**
 * The month's delivery counter: for every type with a target or with work this
 * month, how many were delivered (approved) and how many wait for review.
 */
export function deliveryCounts(
  tasks: { kind?: string | null; status: string }[],
  targets: { kind: string; quantity: number | null }[],
): DeliveryCount[] {
  return TASK_KINDS.map((kind) => {
    const own = tasks.filter((task) => (task.kind ?? 'other') === kind);
    // Several fixed lines can share a type; their numbers add up. Named services without a number have no target.
    const numbered = targets.filter((row) => row.kind === kind && typeof row.quantity === 'number');
    const target = numbered.length > 0 ? numbered.reduce((sum, row) => sum + (row.quantity as number), 0) : null;
    return {
      kind,
      target,
      delivered: own.filter((task) => task.status === 'approved').length,
      inReview: own.filter((task) => task.status === 'submitted').length,
      total: own.length,
    };
  }).filter((row) => row.target !== null || row.total > 0);
}

/** Where a video's thumbnail stands: "Missing" when no thumbnail is tied to it. */
export function thumbnailState(videoId: string, tasks: { kind?: string; for_task_id?: string | null; status: string }[]): string {
  const thumbnails = tasks.filter((task) => task.kind === 'thumbnail' && task.for_task_id === videoId);
  if (thumbnails.length === 0) return 'missing';
  return thumbnails.every((task) => task.status === 'approved') ? 'approved' : thumbnails[0].status;
}

export interface TaskInsert {
  org_id: string;
  project_id: string;
  title: string;
  description: string | null;
  file_links: FileLinkInput[];
  assignee_id: string | null;
  points_value: number | null;
  due_date: string | null;
  position: number;
  kind?: string;
}

/** One task row per deliverable, in the order given. */
export function buildDeliverableTasks(
  orgId: string,
  projectId: string,
  deliverables: DeliverableInput[],
): TaskInsert[] {
  return deliverables.map((deliverable, index) => ({
    org_id: orgId,
    project_id: projectId,
    title: deliverable.title.trim(),
    description: deliverable.description?.trim() || null,
    file_links: deliverable.file_links ?? [],
    assignee_id: deliverable.assignee_id ?? null,
    points_value: deliverable.points_value ?? null,
    due_date: deliverable.due_date ?? null,
    position: index,
    // Left out when not given, so projects still save before the deliverable types database update.
    ...(deliverable.kind ? { kind: deliverable.kind } : {}),
  }));
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Parses a textarea of file links, one per line, written either as a bare URL
 * or as "Label | URL". Lines that are not http(s) links are reported back.
 */
export function parseFileLinks(text: string): { links: FileLinkInput[]; invalid: string[] } {
  const links: FileLinkInput[] = [];
  const invalid: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bar = line.lastIndexOf('|');
    const url = (bar >= 0 ? line.slice(bar + 1) : line).trim();
    const label = (bar >= 0 ? line.slice(0, bar) : '').trim();
    if (!isHttpUrl(url)) {
      invalid.push(line);
      continue;
    }
    links.push({ label: label || new URL(url).hostname, url });
  }
  return { links, invalid };
}

export function formatFileLinks(links: FileLinkInput[] | null | undefined): string {
  return (links ?? []).map((link) => `${link.label} | ${link.url}`).join('\n');
}

export interface FixedDeliverable {
  kind: string;
  quantity: number | null;
  label: string | null;
}

export interface PlannedTask {
  kind: TaskKind;
  title: string;
}

/** "5 videos", "Social media management", "3 social media posts (reels)". */
export function describeFixed(row: FixedDeliverable): string {
  const kind = (TASK_KINDS as readonly string[]).includes(row.kind) ? (row.kind as TaskKind) : 'other';
  if (row.quantity === null) return row.label ?? TASK_KIND_SINGLE[kind];
  return row.label ? `${countOf(kind, row.quantity)} (${row.label})` : countOf(kind, row.quantity);
}

/**
 * The tasks a month still needs to match its fixed deliverables: "Video 1" to
 * "Video 5" for five videos (numbering after any already there, and only as
 * many as are missing), and one task for each named service not yet in the month.
 */
export function planTasksFromFixed(fixed: FixedDeliverable[], existing: { kind?: string | null; title: string }[]): PlannedTask[] {
  const planned: PlannedTask[] = [];
  for (const kind of TASK_KINDS) {
    const wanted = fixed.filter((row) => row.kind === kind && row.quantity !== null).reduce((sum, row) => sum + (row.quantity ?? 0), 0);
    const have = existing.filter((task) => (task.kind ?? 'other') === kind).length;
    for (let number = have + 1; number <= wanted; number += 1) planned.push({ kind, title: `${TASK_KIND_SINGLE[kind]} ${number}` });
  }
  const titles = new Set(existing.map((task) => task.title.trim().toLowerCase()));
  for (const row of fixed) {
    if (row.quantity !== null || !row.label) continue;
    if (titles.has(row.label.trim().toLowerCase())) continue;
    const kind = (TASK_KINDS as readonly string[]).includes(row.kind) ? (row.kind as TaskKind) : 'other';
    planned.push({ kind, title: row.label.trim() });
    titles.add(row.label.trim().toLowerCase());
  }
  return planned;
}

/** Titles for several copies at once: "Video" ×3 after two existing videos → "Video 3", "Video 4", "Video 5". */
export function numberedTitles(title: string, count: number, existingOfKind: number): string[] {
  const base = title.trim().replace(/\s+\d+$/, '');
  if (count <= 1) return [title.trim()];
  return Array.from({ length: count }, (_, index) => `${base} ${existingOfKind + index + 1}`);
}

export interface ExtraLine {
  kind: TaskKind;
  description: string;
  quantity: number;
}

/**
 * What a month delivered beyond its fixed deliverables, to bill separately:
 * for a type with a fixed number, only what went over it; when the client has
 * no fixed numbers at all, everything delivered. Only approved work counts.
 */
export function extrasForMonth(counts: DeliveryCount[], monthLabel: string): ExtraLine[] {
  const anyFixed = counts.some((row) => row.target !== null);
  return counts
    .map((row) => ({ row, extra: row.target === null ? (anyFixed ? 0 : row.delivered) : Math.max(0, row.delivered - row.target) }))
    .filter(({ extra }) => extra > 0)
    .map(({ row, extra }) => ({
      kind: row.kind,
      quantity: extra,
      description: `${row.target === null ? TASK_KIND_LABEL[row.kind] : `Extra ${TASK_KIND_LABEL[row.kind].toLowerCase()}`}, ${monthLabel}`,
    }));
}

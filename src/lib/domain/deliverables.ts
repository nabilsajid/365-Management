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
  targets: { kind: string; quantity: number }[],
): DeliveryCount[] {
  return TASK_KINDS.map((kind) => {
    const own = tasks.filter((task) => (task.kind ?? 'other') === kind);
    const target = targets.find((row) => row.kind === kind)?.quantity ?? null;
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

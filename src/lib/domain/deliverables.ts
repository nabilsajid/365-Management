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
}

/** What a deliverable is. The order here is the order the groups appear on a project. */
export const TASK_KINDS = ['shoot', 'video', 'thumbnail', 'graphic', 'other'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];
export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  shoot: 'Shoots',
  video: 'Videos',
  thumbnail: 'Thumbnails',
  graphic: 'Graphics',
  other: 'Other deliverables',
};
export const TASK_KIND_SINGLE: Record<TaskKind, string> = {
  shoot: 'Shoot',
  video: 'Video',
  thumbnail: 'Thumbnail',
  graphic: 'Graphic',
  other: 'Other',
};

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

import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDeliverableTasks, buildPackageItems, type DeliverableInput, type FileLinkInput } from '../domain/deliverables';

export interface ProjectInput {
  name: string;
  /** Optional. The client is looked up by name and created if it is new. */
  client_name?: string | null;
  brief?: string | null;
  status?: string;
  start_date?: string | null;
  due_date?: string | null;
  shoot_status?: string;
  shoot_date?: string | null;
  file_links?: FileLinkInput[];
  member_ids?: string[];
  deliverables?: DeliverableInput[];
  kind?: 'one_time' | 'monthly';
  targets?: Partial<Record<string, number>>;
  services?: string[];
}

type DbError = { code?: string; message: string };
type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: DbError };

/** The id of the client with this name, creating it when it does not exist yet. Blank means no client. */
export async function resolveClient(
  supabase: SupabaseClient,
  orgId: string,
  clientName: string | null | undefined,
): Promise<Result<string | null>> {
  const name = clientName?.trim();
  if (!name) return { data: null };

  const existing = await supabase.from('clients').select('id').eq('org_id', orgId).ilike('name', name.replace(/[%_\\]/g, '\\$&')).limit(1);
  if (existing.error) return { error: existing.error };
  const found = (existing.data ?? [])[0] as { id: string } | undefined;
  if (found) return { data: found.id };

  const created = await supabase.from('clients').insert({ org_id: orgId, name }).select('id').single();
  if (created.error) return { error: created.error };
  return { data: created.data.id as string };
}

/**
 * Adds a project with its brief, links and team, and one task per deliverable
 * if any were given. If a later step fails the project is removed again, so a
 * half-created project is never left behind.
 */
export async function createProjectWithDeliverables(
  supabase: SupabaseClient,
  orgId: string,
  input: ProjectInput,
  /** For a monthly project: the first day of the month to open straight away. */
  currentMonth?: string,
): Promise<Result<Record<string, unknown>>> {
  const { deliverables = [], member_ids: memberIds = [], client_name: clientName, file_links: fileLinks = [], targets: _targets, services: _services, ...project } = input;

  const client = await resolveClient(supabase, orgId, clientName);
  if (client.error) return { error: client.error };

  const created = await supabase
    .from('projects')
    .insert({ ...project, org_id: orgId, client_id: client.data, file_links: fileLinks })
    .select('*')
    .single();
  if (created.error) return { error: created.error };
  const projectId = created.data.id as string;

  const undo = async (error: DbError) => {
    await supabase.from('projects').delete().eq('id', projectId).eq('org_id', orgId);
    return { error };
  };

  // A deliverable can go to anyone, including people who are not on the project's team.
  const teamIds = [...new Set(memberIds)];

  if (teamIds.length > 0) {
    const team = await supabase.rpc('set_project_members', { p_project: projectId, p_members: teamIds });
    if (team.error) return undo(team.error);
  }

  // A monthly client: its optional targets, and this month started (empty; work is added as it comes).
  if (input.kind === 'monthly') {
    const targets = Object.entries(input.targets ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && entry[1] > 0);
    // Numbered ones ("5 videos") and named services ("Social media management").
    const lines = [
      ...targets.map(([kind, quantity]) => ({ kind, quantity, label: null as string | null })),
      ...(input.services ?? []).map((label) => ({ kind: 'other', quantity: null as number | null, label })),
    ];
    if (lines.length > 0) {
      const saved = await supabase
        .from('project_targets')
        .insert(lines.map((line, position) => ({ ...line, org_id: orgId, project_id: projectId, position })));
      if (saved.error) return undo(saved.error);
    }
    const items = buildPackageItems(orgId, projectId, deliverables);
    if (items.length > 0) {
      const saved = await supabase.from('project_package_items').insert(items).select('id, position');
      if (saved.error) return undo(saved.error);
      const idAt = new Map((saved.data as { id: string; position: number }[]).map((row) => [row.position, row.id]));
      for (const [index, item] of deliverables.entries()) {
        const target = typeof item.for_index === 'number' ? idAt.get(item.for_index) : undefined;
        const own = idAt.get(index);
        if (!target || !own || target === own) continue;
        const tied = await supabase.from('project_package_items').update({ for_item_id: target }).eq('id', own);
        if (tied.error) return undo(tied.error);
      }
    }
    if (currentMonth) {
      const opened = await supabase.rpc('open_project_month', { p_project: projectId, p_month: currentMonth });
      if (opened.error) return undo(opened.error);
    }
    return { data: { ...created.data, tasks: [] } };
  }

  const rows = buildDeliverableTasks(orgId, projectId, deliverables);
  if (rows.length === 0) return { data: { ...created.data, tasks: [] } };

  const tasks = await supabase.from('tasks').insert(rows).select('*');
  if (tasks.error) return undo(tasks.error);

  // Tie each thumbnail to its video, now that the videos have ids.
  const idAt = new Map((tasks.data as { id: string; position: number }[]).map((task) => [task.position, task.id]));
  for (const [index, item] of deliverables.entries()) {
    const target = typeof item.for_index === 'number' ? idAt.get(item.for_index) : undefined;
    const own = idAt.get(index);
    if (!target || !own || target === own) continue;
    const tied = await supabase.from('tasks').update({ for_task_id: target }).eq('id', own).eq('org_id', orgId);
    if (tied.error) return undo(tied.error);
  }

  return { data: { ...created.data, tasks: tasks.data } };
}

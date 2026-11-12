import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDeliverableTasks, type DeliverableInput } from '../domain/deliverables';

export interface ProjectInput {
  client_id: string;
  name: string;
  brief?: string | null;
  status?: string;
  start_date?: string | null;
  due_date?: string | null;
  deliverables: DeliverableInput[];
}

type DbError = { code?: string; message: string };

/**
 * Client onboarding: creates the project with its brief, then one task per
 * deliverable. If the tasks cannot be created the project is removed again,
 * so a half-onboarded project is never left behind.
 */
export async function createProjectWithDeliverables(
  supabase: SupabaseClient,
  orgId: string,
  input: ProjectInput,
): Promise<{ data: Record<string, unknown>; error?: undefined } | { data?: undefined; error: DbError }> {
  const { deliverables, ...project } = input;

  const created = await supabase
    .from('projects')
    .insert({ ...project, org_id: orgId })
    .select('*')
    .single();
  if (created.error) return { error: created.error };

  const rows = buildDeliverableTasks(orgId, created.data.id as string, deliverables);
  if (rows.length === 0) return { data: { ...created.data, tasks: [] } };

  const tasks = await supabase.from('tasks').insert(rows).select('*');
  if (tasks.error) {
    await supabase.from('projects').delete().eq('id', created.data.id).eq('org_id', orgId);
    return { error: tasks.error };
  }

  return { data: { ...created.data, tasks: tasks.data } };
}

import type { SupabaseClient } from '@supabase/supabase-js';

export type SearchKind = 'project' | 'task' | 'client' | 'person' | 'notice';
export interface SearchItem {
  href: string;
  title: string;
  detail?: string | null;
}
export interface SearchGroup {
  kind: SearchKind;
  title: string;
  items: SearchItem[];
}

/** Turns what was typed into a safe "contains" pattern: % and _ are matched literally. */
const pattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

type Row = Record<string, string | null>;
const rows = (data: unknown) => (Array.isArray(data) ? (data as Row[]) : []);

/**
 * Projects, tasks, clients, people and announcements matching the text. Row
 * level security means everyone only finds what they are allowed to see.
 */
export async function runSearch(supabase: SupabaseClient, orgId: string, text: string, perGroup = 10): Promise<SearchGroup[]> {
  const query = text.trim().slice(0, 80);
  if (query.length < 2) return [];
  const like = pattern(query);
  const safe = like.replace(/[,()]/g, ' ');
  const [projectsR, clientsR, tasksR, peopleR, noticesR] = await Promise.all([
    supabase.from('projects').select('id, name, status').eq('org_id', orgId).ilike('name', like).limit(perGroup),
    supabase.from('clients').select('id, name, contact_name').eq('org_id', orgId).ilike('name', like).limit(perGroup),
    supabase.from('tasks').select('id, title, status').eq('org_id', orgId).ilike('title', like).limit(perGroup),
    supabase.from('profiles').select('id, full_name, job_title, contact').eq('org_id', orgId).or(`full_name.ilike.${safe},nickname.ilike.${safe}`).limit(perGroup),
    supabase.from('notices').select('id, title').eq('org_id', orgId).ilike('title', like).limit(perGroup),
  ]);
  const groups: SearchGroup[] = [
    { kind: 'project', title: 'Projects', items: rows(projectsR.data).map((row) => ({ href: `/projects/${row.id}`, title: row.name ?? '', detail: row.status })) },
    { kind: 'task', title: 'Tasks', items: rows(tasksR.data).map((row) => ({ href: `/tasks/${row.id}`, title: row.title ?? '', detail: row.status?.replace(/_/g, ' ') })) },
    { kind: 'client', title: 'Clients', items: rows(clientsR.data).map((row) => ({ href: '/projects?view=clients', title: row.name ?? '', detail: row.contact_name })) },
    {
      kind: 'person',
      title: 'People',
      items: rows(peopleR.data).map((row) => ({ href: '/profile?tab=team', title: row.full_name ?? '', detail: [row.job_title, row.contact].filter(Boolean).join(' · ') })),
    },
    { kind: 'notice', title: 'Announcements', items: rows(noticesR.data).map((row) => ({ href: '/updates', title: row.title ?? '' })) },
  ];
  return groups.filter((group) => group.items.length > 0);
}

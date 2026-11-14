import { FolderKanban, ListChecks, Megaphone, Search, User, Users } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { getPageContext, rowsOf } from '@/lib/page';

/** Turns what was typed into a safe "contains" pattern: % and _ are matched literally. */
const pattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

// One search box for projects, clients, tasks, people and announcements. Row
// level security means everyone only finds what they are allowed to see.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = ((await searchParams).q ?? '').trim().slice(0, 80);
  const { supabase, orgId } = await getPageContext();

  let groups: { title: string; icon: ReactNode; items: { href: string; title: string; detail?: string | null }[] }[] = [];
  if (query.length >= 2) {
    const like = pattern(query);
    const [projectsR, clientsR, tasksR, peopleR, noticesR] = await Promise.all([
      supabase.from('projects').select('id, name, status').eq('org_id', orgId).ilike('name', like).limit(10),
      supabase.from('clients').select('id, name, contact_name').eq('org_id', orgId).ilike('name', like).limit(10),
      supabase.from('tasks').select('id, title, status, project_id').eq('org_id', orgId).ilike('title', like).limit(15),
      supabase.from('profiles').select('id, full_name, job_title, contact').eq('org_id', orgId).or(`full_name.ilike.${like.replace(/[,()]/g, ' ')},nickname.ilike.${like.replace(/[,()]/g, ' ')}`).limit(10),
      supabase.from('notices').select('id, title').eq('org_id', orgId).ilike('title', like).limit(10),
    ]);
    groups = [
      { title: 'Projects', icon: <FolderKanban size={15} aria-hidden />, items: rowsOf<{ id: string; name: string; status: string }>(projectsR.data).map((row) => ({ href: `/projects/${row.id}`, title: row.name, detail: row.status })) },
      { title: 'Tasks', icon: <ListChecks size={15} aria-hidden />, items: rowsOf<{ id: string; title: string; status: string }>(tasksR.data).map((row) => ({ href: `/tasks/${row.id}`, title: row.title, detail: row.status.replace(/_/g, ' ') })) },
      { title: 'Clients', icon: <Users size={15} aria-hidden />, items: rowsOf<{ id: string; name: string; contact_name: string | null }>(clientsR.data).map((row) => ({ href: '/projects?view=clients', title: row.name, detail: row.contact_name })) },
      { title: 'People', icon: <User size={15} aria-hidden />, items: rowsOf<{ id: string; full_name: string; job_title: string | null; contact?: string | null }>(peopleR.data).map((row) => ({ href: '/profile?tab=team', title: row.full_name, detail: [row.job_title, row.contact].filter(Boolean).join(' · ') })) },
      { title: 'Announcements', icon: <Megaphone size={15} aria-hidden />, items: rowsOf<{ id: string; title: string }>(noticesR.data).map((row) => ({ href: '/updates', title: row.title })) },
    ].filter((group) => group.items.length > 0);
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Search</h1>
          <p className="muted">Projects, tasks, clients, people and announcements.</p>
        </div>
      </div>
      <form action="/search" className="search-page-form" role="search">
        <Search size={16} aria-hidden />
        <input name="q" defaultValue={query} placeholder="Type at least two letters…" aria-label="Search" autoFocus />
        <button type="submit">Search</button>
      </form>

      {query.length < 2 ? null : groups.length === 0 ? (
        <section className="panel">
          <p className="muted">Nothing matches “{query}”.</p>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.title} className="panel">
            <header className="panel-header">
              <div>
                <h2 className="flex items-center gap-2">
                  {group.icon}
                  {group.title}
                  <span className="count">{group.items.length}</span>
                </h2>
              </div>
            </header>
            <ul className="search-results">
              {group.items.map((item) => (
                <li key={`${group.title}-${item.href}-${item.title}`}>
                  <Link href={item.href}>
                    <strong>{item.title}</strong>
                    {item.detail ? <span className="muted">{item.detail}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </>
  );
}

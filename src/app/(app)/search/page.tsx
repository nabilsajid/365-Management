import { getPageContext } from '@/lib/page';
import { LiveSearchInput } from '@/components/live-search-input';
import { Highlight } from '@/components/search-box';
import { SearchIcon } from '@/components/search-icons';
import { runSearch } from '@/lib/services/search';
import Link from 'next/link';

// One search box for projects, clients, tasks, people and announcements.
// Results update as you type; everyone only finds what they are allowed to see.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const query = ((await searchParams).q ?? '').trim().slice(0, 80);
  const { supabase, orgId, isAdmin, segments } = await getPageContext();
  const groups = await runSearch(supabase, orgId, query, { isAdmin, segments }, 10);

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Search</h1>
          <p className="muted">Everything in the app: pages, projects, tasks, people, clients, invoices, costs, equipment, announcements, messages, comments and leave.</p>
        </div>
      </div>
      <LiveSearchInput initial={query} />

      {query.length < 2 ? null : groups.length === 0 ? (
        <section className="panel">
          <p className="muted">Nothing matches “{query}”.</p>
        </section>
      ) : (
        groups.map((group) => (
          <section key={group.kind} className="panel">
            <header className="panel-header">
              <div>
                <h2 className="flex items-center gap-2">
                  <SearchIcon kind={group.kind} />
                  {group.title}
                  <span className="count">{group.items.length}</span>
                </h2>
              </div>
            </header>
            <ul className="search-results">
              {group.items.map((item, position) => (
                <li key={`${group.kind}-${position}`}>
                  <Link href={item.href}>
                    <strong>
                      <Highlight text={item.title} query={query} />
                    </strong>
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

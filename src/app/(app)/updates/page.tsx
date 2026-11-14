import Link from 'next/link';
import { Announcements } from './announcements';
import { Broadcasts } from './broadcasts';
import { Messages } from './messages';

const TABS = [
  { key: 'announcements', label: 'Announcements' },
  { key: 'broadcasts', label: 'Broadcasts' },
  { key: 'messages', label: 'Messages' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// One place for everything people are told: announcements for everyone,
// broadcasts to the admins, and personal messages from an admin to one person.
export default async function UpdatesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some((item) => item.key === requested) ? (requested as Tab) : 'announcements';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Updates</h1>
          <p className="muted">Announcements for everyone, urgent broadcasts to the admins, and personal messages.</p>
        </div>
      </div>

      <nav className="tabs" aria-label="Update sections">
        {TABS.map((item) => (
          <Link key={item.key} href={`/updates?tab=${item.key}`} aria-current={tab === item.key ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === 'announcements' ? <Announcements /> : tab === 'broadcasts' ? <Broadcasts /> : <Messages />}
    </>
  );
}

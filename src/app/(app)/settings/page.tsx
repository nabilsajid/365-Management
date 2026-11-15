import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPageContext } from '@/lib/page';
import { AppearanceSection } from './appearance-section';
import { CompanySection, RemindersSection } from './company-section';
import { DeleteLogSection } from './delete-log-section';
import { RulesSection } from './rules-section';
import { SystemSection } from './system-section';

const TABS = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'company', label: 'Company' },
  { key: 'rules', label: 'Rules' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'delete-log', label: 'Delete log' },
  { key: 'system', label: 'System check' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// Admin only: everything about how the app itself is set up, in one place.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { isAdmin } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');
  const requested = (await searchParams).tab;
  const tab: Tab = TABS.some((item) => item.key === requested) ? (requested as Tab) : 'appearance';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">How the app looks and behaves for everyone: company details, menu, rules, reminders, what was deleted, and whether everything is set up.</p>
        </div>
      </div>
      <nav className="tabs" aria-label="Settings sections">
        {TABS.map((item) => (
          <Link key={item.key} href={`/settings?tab=${item.key}`} aria-current={tab === item.key ? 'page' : undefined}>
            {item.label}
          </Link>
        ))}
      </nav>
      {tab === 'appearance' ? (
        <AppearanceSection />
      ) : tab === 'company' ? (
        <CompanySection />
      ) : tab === 'reminders' ? (
        <RemindersSection />
      ) : tab === 'rules' ? (
        <RulesSection />
      ) : tab === 'delete-log' ? <DeleteLogSection /> : <SystemSection />}
    </>
  );
}

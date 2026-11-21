import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPageContext } from '@/lib/page';
import { ActivitySection } from './activity-section';
import { AppearanceSection } from './appearance-section';
import { BackupsSection } from './backups-section';
import { CompanySection, RemindersSection } from './company-section';
import { InvoiceSection } from './invoice-section';
import { DeleteLogSection } from './delete-log-section';
import { RulesSection } from './rules-section';
import { SecuritySection } from './security-section';
import { SystemSection } from './system-section';

const TABS = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'company', label: 'Company' },
  { key: 'invoice', label: 'Invoice' },
  { key: 'rules', label: 'Rules' },
  { key: 'reminders', label: 'Reminders' },
  { key: 'activity', label: 'Activity' },
  { key: 'delete-log', label: 'Delete log' },
  { key: 'backups', label: 'Backups' },
  { key: 'security', label: 'Security' },
  { key: 'system', label: 'System check' },
] as const;
type Tab = (typeof TABS)[number]['key'];

// Admin only: everything about how the app itself is set up, in one place.
export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string; kind?: string }> }) {
  const { isAdmin } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');
  const { tab: requested, kind } = await searchParams;
  const tab: Tab = TABS.some((item) => item.key === requested) ? (requested as Tab) : 'appearance';

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Settings</h1>
          <p className="muted">How the app looks and behaves for everyone: company details, menu, rules, reminders, who changed what, what was deleted, backups, two-step sign-in, and whether everything is set up.</p>
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
      ) : tab === 'invoice' ? (
        <InvoiceSection />
      ) : tab === 'reminders' ? (
        <RemindersSection />
      ) : tab === 'rules' ? (
        <RulesSection />
      ) : tab === 'activity' ? (
        <ActivitySection kind={kind} />
      ) : tab === 'backups' ? (
        <BackupsSection />
      ) : tab === 'security' ? (
        <SecuritySection />
      ) : tab === 'delete-log' ? (
        <DeleteLogSection />
      ) : (
        <SystemSection />
      )}
    </>
  );
}

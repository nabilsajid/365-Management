import { redirect } from 'next/navigation';
import { AppearanceForm } from '@/components/appearance-form';
import { readAppearance } from '@/lib/domain/appearance';
import { getPageContext } from '@/lib/page';

// Admin only: how the app looks for everyone in the company.
export default async function AppearancePage() {
  const { supabase, orgId, isAdmin } = await getPageContext();
  if (!isAdmin) redirect('/dashboard');

  const { data, error } = await supabase.from('organizations').select('appearance').eq('id', orgId).maybeSingle();

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Appearance</h1>
          <p className="muted">Choose how the app looks for everyone. Each person still picks light or dark mode for themselves.</p>
        </div>
      </div>
      {error ? (
        <section className="panel">
          <p className="muted">
            Appearance needs a database update first. Run the file <code>20261112000024_appearance.sql</code> in the Supabase SQL
            Editor, then reload this page.
          </p>
        </section>
      ) : (
        <AppearanceForm initial={readAppearance(data?.appearance)} />
      )}
    </>
  );
}

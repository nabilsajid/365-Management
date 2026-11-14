import { AppearanceForm } from '@/components/appearance-form';
import { readAppearance } from '@/lib/domain/appearance';
import { getPageContext } from '@/lib/page';

/** How the app looks for everyone in the company. */
export async function AppearanceSection() {
  const { supabase, orgId } = await getPageContext();

  const { data, error } = await supabase.from('organizations').select('appearance').eq('id', orgId).maybeSingle();

  return (
    <>
      <p className="muted mb-4">Choose how the app looks for everyone. Each person still picks light or dark mode for themselves.</p>
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

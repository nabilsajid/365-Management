import { ApiForm } from '@/components/resource-manager';
import { getPageContext } from '@/lib/page';

/** Company rules: which costs skip approval, and how long deletions are kept. */
export async function RulesSection() {
  const { supabase, orgId } = await getPageContext();
  const { data, error } = await supabase.from('organizations').select('*').eq('id', orgId).maybeSingle();
  const org = (data ?? {}) as { auto_approve_limit?: number | string; delete_log_days?: number };

  if (error || org.auto_approve_limit === undefined) {
    return (
      <section className="panel">
        <p className="muted">
          These rules need a database update first. Run the file <code>20261112000026_rules_leave_notifications.sql</code> in the
          Supabase SQL Editor, then reload this page.
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Rules</h2>
          <p className="muted">How much has to wait for you, and how long deleted things stay in the log.</p>
        </div>
      </header>
      <ApiForm
        endpoint="/api/org-settings"
        method="PATCH"
        submitLabel="Save rules"
        resetOnSuccess={false}
        initial={{ auto_approve_limit: Number(org.auto_approve_limit ?? 0), delete_log_days: org.delete_log_days ?? 30 }}
        fields={[
          {
            name: 'auto_approve_limit',
            label: 'Costs that skip approval, up to (৳)',
            type: 'number',
            required: true,
            hint: 'A trip or cost up to this amount, added by someone allowed to edit costs or cash flow, applies straight away. Equipment purchases always wait. 0 means everything waits.',
          },
          { name: 'delete_log_days', label: 'Keep deleted items in the log for (days)', type: 'number', required: true, hint: 'Between 1 and 365.' },
        ]}
      />
    </section>
  );
}

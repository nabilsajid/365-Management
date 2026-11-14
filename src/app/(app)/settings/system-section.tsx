import { CheckCircle2, CircleAlert, CircleHelp } from 'lucide-react';
import { DATABASE_UPDATES, UNCHECKABLE } from '@/lib/domain/system-check';
import { getPageContext } from '@/lib/page';
import { pushConfigured } from '@/lib/server/push';

/** Which database updates have been run, and which server settings are in place. */
export async function SystemSection() {
  const { supabase } = await getPageContext();

  // Ask for one column each update adds, without reading any data. A missing
  // table or column means that update has not been run.
  const results = await Promise.all(
    DATABASE_UPDATES.map(async (update) => {
      const { error } = await supabase.from(update.table).select(update.column).limit(0);
      return { ...update, ok: !error };
    }),
  );
  const missing = results.filter((result) => !result.ok);

  const settings = [
    { name: 'SUPABASE_SERVICE_ROLE_KEY', ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY), needed: 'Adding people, passwords, sign-up emails and device alerts' },
    { name: 'Device alert keys (VAPID)', ok: pushConfigured(), needed: 'Alerts on phones and computers' },
    { name: 'CRON_SECRET', ok: Boolean(process.env.CRON_SECRET), needed: 'Optional: protects the daily job that creates recurring projects' },
  ];

  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Database updates</h2>
            <p className="muted">
              {missing.length === 0
                ? 'Every update has been run.'
                : `${missing.length} ${missing.length === 1 ? 'update has' : 'updates have'} not been run. Run ${missing.length === 1 ? 'it' : 'them'} in the Supabase SQL Editor, oldest first; the files are in the repository under supabase/migrations.`}
            </p>
          </div>
        </header>
        <ul className="check-list">
          {results.map((result) => (
            <li key={result.file} className={result.ok ? undefined : 'check-missing'}>
              {result.ok ? <CheckCircle2 size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
              <span>
                <strong>{result.adds}</strong>
                <code>{result.file}</code>
              </span>
              <span className={result.ok ? 'badge badge-approved' : 'badge badge-rejected'}>{result.ok ? 'Run' : 'Not run'}</span>
            </li>
          ))}
          {UNCHECKABLE.map((file) => (
            <li key={file}>
              <CircleHelp size={16} aria-hidden />
              <span>
                <strong>Background behaviour only</strong>
                <code>{file}</code>
              </span>
              <span className="badge">Cannot be checked</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Server settings</h2>
            <p className="muted">Set in Vercel, under Project → Settings → Environment Variables. Values are never shown here.</p>
          </div>
        </header>
        <ul className="check-list">
          {settings.map((setting) => (
            <li key={setting.name} className={setting.ok ? undefined : 'check-missing'}>
              {setting.ok ? <CheckCircle2 size={16} aria-hidden /> : <CircleAlert size={16} aria-hidden />}
              <span>
                <strong>{setting.name}</strong>
                <span className="muted">{setting.needed}</span>
              </span>
              <span className={setting.ok ? 'badge badge-approved' : 'badge'}>{setting.ok ? 'Set' : 'Not set'}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

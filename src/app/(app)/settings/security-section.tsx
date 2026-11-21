import { TwoStepSetup } from '@/components/two-step-setup';

/** Two-step sign-in for the admin who is signed in. */
export async function SecuritySection() {
  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Two-step sign-in</h2>
          <p className="muted">
            For your own admin account. Every admin should turn it on for themselves. If you lose your phone, another admin can
            reset your password, but the code app has to be set up again by removing it in Supabase (Authentication → Users).
          </p>
        </div>
      </header>
      <TwoStepSetup />
    </section>
  );
}

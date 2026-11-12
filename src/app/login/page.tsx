import { LoginForm } from './login-form';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <main className="login">
      <h1>365 Management</h1>
      <p className="muted">Sign in with the email and password your admin set up for you.</p>
      <LoginForm
        notice={
          reason === 'no-access'
            ? 'You are not signed in, or your account has no active employee profile yet.'
            : undefined
        }
      />
    </main>
  );
}

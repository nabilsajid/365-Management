import { AppInstall } from '@/components/app-install';
import { LoginForm } from './login-form';

// The login page always uses the dark look, so the white logo reads clearly.
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  return (
    <div className="login-scene">
      {/* Slow, soft background: three drifting glows (blue, green, orange) over a faint grid. Decorative only. */}
      <div className="login-grid" aria-hidden />
      <div className="login-glow login-glow-a" aria-hidden />
      <div className="login-glow login-glow-b" aria-hidden />
      <div className="login-glow login-glow-c" aria-hidden />

      <main className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="365 Frames" width={188} height={56} className="login-logo" />
        <LoginForm
          notice={
            reason === 'no-access'
              ? 'You are not signed in, or your account has no active employee profile yet.'
              : undefined
          }
        />
        <AppInstall variant="login" />
      </main>
    </div>
  );
}

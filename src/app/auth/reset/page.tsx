import { ResetForm } from './reset-form';

export const metadata = { title: 'Choose a new password' };

// Where the emailed reset link lands. Same look as the login page.
export default function ResetPage() {
  return (
    <div className="login-scene">
      <div className="login-grid" aria-hidden />
      <div className="login-glow login-glow-a" aria-hidden />
      <div className="login-glow login-glow-b" aria-hidden />
      <div className="login-glow login-glow-c" aria-hidden />
      <main className="login-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="365 Frames" width={188} height={56} className="login-logo" />
        <ResetForm />
      </main>
    </div>
  );
}

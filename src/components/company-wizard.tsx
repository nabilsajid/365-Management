'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent } from 'react';
import { OPTIONAL_SECTIONS, SECTION_INFO, SECTION_LABEL, type OptionalSection } from '@/lib/domain/sections';
import { fitLogo } from './image-tools';
import { toast } from './resource-manager';

const STEPS = ['Company', 'Features', 'First admin'] as const;

/**
 * Setting up a new company in three steps: its details and logo, the features
 * it needs, and its first admin. The standard roles (Admin, Editor,
 * Cinematographer and so on) and point rules are created with it.
 */
export function CompanyWizard({ timezones, currencies }: { timezones: string[]; currencies: string[] }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState({ name: '', trade_license: '', timezone: 'Asia/Dhaka', currency: 'BDT' });
  const [logo, setLogo] = useState<string | null>(null);
  const [features, setFeatures] = useState<Set<OptionalSection>>(() => new Set(OPTIONAL_SECTIONS));
  const [adminInfo, setAdminInfo] = useState({ admin_name: '', admin_email: '', admin_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function next(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (step === 0 && details.name.trim().length < 2) return setError('Write the company name.');
    setStep(step + 1);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const response = await fetch('/api/companies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...details,
        ...adminInfo,
        logo_data: logo,
        hidden_sections: OPTIONAL_SECTIONS.filter((feature) => !features.has(feature)),
      }),
    });
    setBusy(false);
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      return setError(problem?.error?.message ?? `Could not add the company (${response.status}).`);
    }
    toast(`${details.name} is ready`, 'success');
    setStep(0);
    setDetails({ name: '', trade_license: '', timezone: 'Asia/Dhaka', currency: 'BDT' });
    setLogo(null);
    setFeatures(new Set(OPTIONAL_SECTIONS));
    setAdminInfo({ admin_name: '', admin_email: '', admin_password: '' });
    startTransition(() => router.refresh());
  }

  return (
    <div className="wizard">
      <ol className="wizard-steps">
        {STEPS.map((name, index) => (
          <li key={name} className={index === step ? 'current' : index < step ? 'done' : undefined}>
            <span>{index + 1}</span> {name}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <form onSubmit={next} className="form-grid">
          <label className="field">
            <span>Company name *</span>
            <input value={details.name} onChange={(event) => setDetails({ ...details, name: event.target.value })} required />
          </label>
          <label className="field">
            <span>Trade licence no. (optional)</span>
            <input value={details.trade_license} onChange={(event) => setDetails({ ...details, trade_license: event.target.value })} />
          </label>
          <label className="field">
            <span>Time zone</span>
            <select value={details.timezone} onChange={(event) => setDetails({ ...details, timezone: event.target.value })}>
              {timezones.map((zone) => (
                <option key={zone}>{zone}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Currency</span>
            <select value={details.currency} onChange={(event) => setDetails({ ...details, currency: event.target.value })}>
              {currencies.map((code) => (
                <option key={code}>{code}</option>
              ))}
            </select>
          </label>
          <div className="field wide">
            <span>Logo (optional)</span>
            <div className="flex flex-wrap items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {logo ? <img src={logo} alt="Logo" style={{ maxHeight: 48, maxWidth: 160 }} /> : null}
              <label className="button">
                {logo ? 'Change logo' : 'Choose logo'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      setLogo(await fitLogo(file));
                    } catch (reason) {
                      setError((reason as Error).message);
                    }
                  }}
                />
              </label>
              {logo ? (
                <button type="button" onClick={() => setLogo(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
          {error ? <p className="error wide" role="alert">{error}</p> : null}
          <div className="actions wide">
            <button type="submit" className="primary">
              Next: features
            </button>
          </div>
        </form>
      ) : null}

      {step === 1 ? (
        <form onSubmit={next} className="settings-toggles">
          <p className="muted">Choose what this company needs. Projects, tasks, cash flow, approvals and the team list are always included. Features can be changed later in Settings → Company.</p>
          {OPTIONAL_SECTIONS.map((feature) => (
            <label key={feature} className="toggle-row">
              <input
                type="checkbox"
                checked={features.has(feature)}
                onChange={(event) => {
                  const nextSet = new Set(features);
                  if (event.target.checked) nextSet.add(feature);
                  else nextSet.delete(feature);
                  setFeatures(nextSet);
                }}
              />
              <span>
                <strong>{SECTION_LABEL[feature]}</strong>
                <small className="muted">{SECTION_INFO[feature].about}</small>
              </span>
            </label>
          ))}
          <div className="actions">
            <button type="button" onClick={() => setStep(0)}>
              Back
            </button>
            <button type="submit" className="primary">
              Next: first admin
            </button>
          </div>
        </form>
      ) : null}

      {step === 2 ? (
        <form onSubmit={create} className="form-grid">
          <p className="muted wide">
            The admin signs in with this email and password, then adds the team. The company starts with the standard roles
            (Admin, Editor, Cinematographer and more) so it is clear how access works; rename or change them in Roles &amp;
            Access. Send the login details to the admin yourself.
          </p>
          <label className="field">
            <span>Admin&apos;s full name *</span>
            <input value={adminInfo.admin_name} onChange={(event) => setAdminInfo({ ...adminInfo, admin_name: event.target.value })} required />
          </label>
          <label className="field">
            <span>Admin&apos;s email (their login) *</span>
            <input type="email" value={adminInfo.admin_email} onChange={(event) => setAdminInfo({ ...adminInfo, admin_email: event.target.value })} required />
          </label>
          <label className="field">
            <span>Admin&apos;s first password *</span>
            <input value={adminInfo.admin_password} onChange={(event) => setAdminInfo({ ...adminInfo, admin_password: event.target.value })} required minLength={6} autoComplete="new-password" />
            <small className="muted">At least 6 characters. They can change it after signing in.</small>
          </label>
          {error ? <p className="error wide" role="alert">{error}</p> : null}
          <div className="actions wide">
            <button type="button" onClick={() => setStep(1)} disabled={busy}>
              Back
            </button>
            <button type="submit" className="primary" disabled={busy}>
              {busy ? 'Creating…' : `Create ${details.name || 'company'}`}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

'use client';

import { Check, RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ACCENT_PRESETS, CORNERS, DEFAULT_APPEARANCE, appearanceCss, type Appearance, type Corners } from '@/lib/domain/appearance';
import { cn } from '@/lib/utils';
import { toast } from './resource-manager';

/** Admin: choose the company's accent colour, corners and background glow, with a live preview. */
export function AppearanceForm({ initial }: { initial: Required<Appearance> }) {
  const router = useRouter();
  const [look, setLook] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = look.accent !== initial.accent || look.corners !== initial.corners || look.glow !== initial.glow;

  // Show the choice across the whole app straight away, before saving.
  useEffect(() => {
    let tag = document.getElementById('appearance-preview') as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'appearance-preview';
      document.head.appendChild(tag);
    }
    // The saved look is also on the page; marking every preview value !important makes the preview win
    // whatever order the two styles load in. Turning the glow back on undoes a saved "glow off".
    tag.textContent = (appearanceCss(look) + (look.glow ? '.app-glow{display:block}' : '')).replace(
      /(--[\w-]+|display):([^;{}]+)(?=[;}])/g,
      '$1:$2 !important',
    );
    return () => tag?.remove();
  }, [look]);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/appearance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(look),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `Request failed (${response.status}).`);
        return;
      }
      toast('Appearance saved for everyone', 'success');
      router.refresh();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const custom = !ACCENT_PRESETS.some((preset) => preset.value === look.accent);

  return (
    <>
      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Accent colour</h2>
            <p className="muted">Used for main buttons, the selected sidebar item and money in. Text on it is adjusted automatically so it stays readable.</p>
          </div>
        </header>
        <div className="swatches" role="radiogroup" aria-label="Accent colour">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              role="radio"
              aria-checked={look.accent === preset.value}
              className={cn('swatch', look.accent === preset.value && 'swatch-on')}
              onClick={() => setLook((current) => ({ ...current, accent: preset.value }))}
            >
              <span className="swatch-dot" style={{ background: preset.value }}>
                {look.accent === preset.value ? <Check size={14} aria-hidden /> : null}
              </span>
              {preset.label}
            </button>
          ))}
          <label className={cn('swatch', custom && 'swatch-on')}>
            <input
              type="color"
              value={look.accent}
              aria-label="Custom colour"
              onChange={(event) => setLook((current) => ({ ...current, accent: event.target.value.toLowerCase() }))}
            />
            Custom
          </label>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Corners and background</h2>
          </div>
        </header>
        <div className="form-grid">
          <div className="field">
            <span>Corners</span>
            <div className="segmented" role="radiogroup" aria-label="Corners">
              {(Object.keys(CORNERS) as Corners[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={look.corners === key}
                  className={cn(look.corners === key && 'segmented-on')}
                  onClick={() => setLook((current) => ({ ...current, corners: key }))}
                >
                  {CORNERS[key].label}
                </button>
              ))}
            </div>
          </div>
          <label className="field">
            <span>Background glow</span>
            <span className="inline-flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={look.glow} onChange={(event) => setLook((current) => ({ ...current, glow: event.target.checked }))} />
              A soft glow at the top of the pages, in the accent colour
            </span>
          </label>
        </div>
      </section>

      <section className="panel">
        <header className="panel-header">
          <div>
            <h2>Preview</h2>
            <p className="muted">The whole app already shows your choice. It applies to everyone once saved.</p>
          </div>
        </header>
        <div className="appearance-preview">
          <button type="button" className="primary">
            Main button
          </button>
          <button type="button">Other button</button>
          <span className="badge badge-approved">Done</span>
          <span className="badge badge-pending">Waiting</span>
          <span className="flow-bar" style={{ width: 180 }}>
            <span className="flow-in" style={{ width: '65%' }} />
            <span className="flow-out" style={{ width: '35%' }} />
          </span>
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="actions" style={{ marginTop: '1.25rem' }}>
          <button type="button" className="primary" disabled={busy || !changed} onClick={save}>
            {busy ? 'Saving…' : 'Save for everyone'}
          </button>
          <button type="button" disabled={busy || !changed} onClick={() => setLook(initial)}>
            Undo changes
          </button>
          <button type="button" disabled={busy} onClick={() => setLook(DEFAULT_APPEARANCE)}>
            <RotateCcw size={14} aria-hidden style={{ marginRight: 6 }} />
            Back to the original look
          </button>
        </div>
      </section>
    </>
  );
}

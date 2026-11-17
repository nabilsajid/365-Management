'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from './resource-manager';

/** Reads a chosen image file. Large photos are fine: they are shrunk before saving. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file (JPG, PNG or WebP).'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('That image is over 15 MB. Choose a smaller one.'));
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('That image could not be read.'));
    image.src = url;
  });
}

async function send(endpoint: string, method: 'PUT' | 'DELETE', data?: string): Promise<string | null> {
  const response = await fetch(endpoint, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data ? JSON.stringify({ data }) : undefined,
  });
  if (response.ok) return null;
  const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return problem?.error?.message ?? `Could not save (${response.status}).`;
}

/**
 * The part of an image that is not empty margin: transparent pixels, or plain
 * white around a logo saved on a white background, are cut away so the logo
 * sits exactly where it is placed.
 */
function contentBox(context: CanvasRenderingContext2D, width: number, height: number): { x: number; y: number; w: number; h: number } {
  const { data } = context.getImageData(0, 0, width, height);
  const empty = (index: number) => data[index + 3]! < 16 || (data[index]! > 245 && data[index + 1]! > 245 && data[index + 2]! > 245);
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (empty((y * width + x) * 4)) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  if (right < left || bottom < top) return { x: 0, y: 0, w: width, h: height };
  return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/** A logo image with its empty margins trimmed, fitted inside 480×160 as a PNG (transparency kept). */
export async function fitLogo(file: File): Promise<string> {
  const image = await loadImage(file);
  const full = document.createElement('canvas');
  full.width = image.naturalWidth;
  full.height = image.naturalHeight;
  const fullContext = full.getContext('2d', { willReadFrequently: true })!;
  fullContext.drawImage(image, 0, 0);
  const box = contentBox(fullContext, full.width, full.height);
  const scale = Math.min(1, 480 / box.w, 160 / box.h);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(box.w * scale));
  canvas.height = Math.max(1, Math.round(box.h * scale));
  canvas.getContext('2d')!.drawImage(full, box.x, box.y, box.w, box.h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** A signature image fitted inside 420×140, transparent edges kept (a photo of a signature on white works too). */
export async function fitSignature(file: File): Promise<string> {
  const image = await loadImage(file);
  const scale = Math.min(1, 420 / image.naturalWidth, 140 / image.naturalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

/** The signature on invoices: upload, change or remove. */
export function SignatureUploader({ current }: { current: string | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const data = await fitSignature(file);
      setBusy(true);
      const problem = await send('/api/org-signature', 'PUT', data);
      setBusy(false);
      if (problem) return setError(problem);
      setPreview(data);
      toast('Signature saved', 'success');
      startTransition(() => router.refresh());
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function remove() {
    setBusy(true);
    const problem = await send('/api/org-signature', 'DELETE');
    setBusy(false);
    if (problem) return setError(problem);
    setPreview(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="logo-uploader">
      <div className="logo-preview" style={{ background: '#fff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {preview ? <img src={preview} alt="Signature" /> : <span className="muted">No signature yet</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="button">
          {busy ? 'Saving…' : preview ? 'Change signature' : 'Upload signature'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={busy} onChange={(event) => choose(event.target.files?.[0])} />
        </label>
        {preview ? (
          <button type="button" onClick={remove} disabled={busy}>
            Remove
          </button>
        ) : null}
      </div>
      <small className="muted">A PNG with a transparent background looks best: sign on white paper, photograph it, and remove the background.</small>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The company logo: fitted inside 480×160, transparent edges kept. */
export function LogoUploader({ current }: { current: string | null }) {
  const router = useRouter();
  const [preview, setPreview] = useState(current);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const data = await fitLogo(file);
      setBusy(true);
      const problem = await send('/api/org-logo', 'PUT', data);
      setBusy(false);
      if (problem) return setError(problem);
      setPreview(data);
      toast('Logo saved', 'success');
      startTransition(() => router.refresh());
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  async function remove() {
    setBusy(true);
    const problem = await send('/api/org-logo', 'DELETE');
    setBusy(false);
    if (problem) return setError(problem);
    setPreview(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="logo-uploader">
      <div className="logo-preview">{preview ? <img src={preview} alt="Company logo" /> : <span className="muted">No logo yet</span>}</div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="button">
          {busy ? 'Saving…' : preview ? 'Change logo' : 'Upload logo'}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden disabled={busy} onChange={(event) => choose(event.target.files?.[0])} />
        </label>
        {preview ? (
          <button type="button" onClick={remove} disabled={busy}>
            Remove
          </button>
        ) : null}
      </div>
      <small className="muted">PNG with a transparent background looks best. Used on invoices and in the menu.</small>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const FRAME = 240;
const OUTPUT = 200;

/**
 * A profile photo: choose an image, drag it to position the face and zoom,
 * then save a square crop. The circle shows how it will look.
 */
export function PhotoEditor({ current, name }: { current: string | null; name: string }) {
  const router = useRouter();
  const [saved, setSaved] = useState(current);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; start: { x: number; y: number } } | null>(null);
  const [, startTransition] = useTransition();

  // The picture covers the frame at zoom 1.
  const base = image ? Math.max(FRAME / image.naturalWidth, FRAME / image.naturalHeight) : 1;
  const width = image ? image.naturalWidth * base * zoom : 0;
  const height = image ? image.naturalHeight * base * zoom : 0;
  // Never let an empty edge show inside the frame.
  const clamp = (value: { x: number; y: number }) => ({
    x: Math.min((width - FRAME) / 2, Math.max(-(width - FRAME) / 2, value.x)),
    y: Math.min((height - FRAME) / 2, Math.max(-(height - FRAME) / 2, value.y)),
  });
  useEffect(() => {
    setOffset((value) => clamp(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, image]);

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setImage(await loadImage(file));
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  function down(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: offset };
  }
  function move(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    setOffset(clamp({ x: drag.current.start.x + event.clientX - drag.current.x, y: drag.current.start.y + event.clientY - drag.current.y }));
  }

  async function save() {
    if (!image) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ratio = OUTPUT / FRAME;
    const left = (FRAME - width) / 2 + offset.x;
    const top = (FRAME - height) / 2 + offset.y;
    canvas.getContext('2d')!.drawImage(image, left * ratio, top * ratio, width * ratio, height * ratio);
    const data = canvas.toDataURL('image/jpeg', 0.85);
    setBusy(true);
    const problem = await send('/api/profile/photo', 'PUT', data);
    setBusy(false);
    if (problem) return setError(problem);
    setSaved(data);
    setImage(null);
    toast('Photo saved', 'success');
    startTransition(() => router.refresh());
  }

  async function remove() {
    setBusy(true);
    const problem = await send('/api/profile/photo', 'DELETE');
    setBusy(false);
    if (problem) return setError(problem);
    setSaved(null);
    startTransition(() => router.refresh());
  }

  return (
    <div className="photo-editor">
      {image ? (
        <>
          <div
            className="photo-frame"
            style={{ width: FRAME, height: FRAME }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            aria-label="Drag to position the photo"
          >
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{ width, height, transform: `translate(${(FRAME - width) / 2 + offset.x}px, ${(FRAME - height) / 2 + offset.y}px)` }}
            />
          </div>
          <label className="field" style={{ maxWidth: FRAME }}>
            <span>Zoom</span>
            <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
          </label>
          <p className="muted" style={{ fontSize: '0.8rem' }}>Drag the photo to move it inside the circle.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="primary" onClick={save} disabled={busy}>
              {busy ? 'Saving…' : 'Save photo'}
            </button>
            <button type="button" onClick={() => setImage(null)} disabled={busy}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <span className="photo-current" aria-hidden>
            {saved ? <img src={saved} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}
          </span>
          <div className="flex flex-wrap gap-2">
            <label className="button">
              {saved ? 'Change photo' : 'Upload photo'}
              <input type="file" accept="image/*" hidden onChange={(event) => choose(event.target.files?.[0])} />
            </label>
            {saved ? (
              <button type="button" onClick={remove} disabled={busy}>
                Remove
              </button>
            ) : null}
          </div>
        </div>
      )}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

'use client';

import { Download, Paperclip, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/browser';
import { toast } from './resource-manager';

export interface TaskFile {
  id: string;
  name: string;
  size: number;
  uploaded_by_name: string;
  uploaded_on: string;
  can_remove: boolean;
}

const MAX = 200 * 1024 * 1024;

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Files for a deliverable: upload straight to private storage, open, remove. */
export function TaskFiles({ orgId, taskId, files, canUpload }: { orgId: string; taskId: string; files: TaskFile[]; canUpload: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(list: FileList | null) {
    if (!list || list.length === 0) return;
    setError(null);
    const supabase = createClient();
    let done = 0;
    for (const file of Array.from(list)) {
      if (file.size > MAX) {
        setError(`${file.name} is larger than 200 MB. Share big files with a Drive or Dropbox link instead.`);
        continue;
      }
      setStatus(`Uploading ${file.name}…`);
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120) || 'file';
      const path = `${orgId}/${taskId}/${crypto.randomUUID().slice(0, 8)}-${safe}`;
      const uploaded = await supabase.storage.from('deliverables').upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (uploaded.error) {
        setError(`${file.name} could not be uploaded: ${uploaded.error.message}`);
        continue;
      }
      const response = await fetch(`/api/tasks/${taskId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, name: file.name.slice(0, 200), size: file.size, content_type: file.type || null }),
      });
      if (!response.ok) {
        await supabase.storage.from('deliverables').remove([path]);
        const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(problem?.error?.message ?? `${file.name} could not be saved.`);
        continue;
      }
      done += 1;
    }
    setStatus(null);
    if (input.current) input.current.value = '';
    if (done > 0) {
      toast(done === 1 ? 'File uploaded.' : `${done} files uploaded.`, 'success');
      startTransition(() => router.refresh());
    }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/files/${id}`, { method: 'DELETE' });
    if (!response.ok) {
      const problem = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(problem?.error?.message ?? 'The file could not be removed.');
      return;
    }
    toast('File removed.');
    startTransition(() => router.refresh());
  }

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>Files</h2>
          <p className="muted">Drafts, cuts and thumbnails, kept privately for your team. Up to 200 MB each.</p>
        </div>
        {canUpload ? (
          <label className={status ? 'button primary disabled' : 'button primary'}>
            <Paperclip size={14} aria-hidden style={{ marginRight: 6 }} />
            {status ? 'Uploading…' : 'Upload files'}
            <input ref={input} type="file" multiple hidden disabled={Boolean(status)} onChange={(event) => upload(event.target.files)} />
          </label>
        ) : null}
      </header>
      {status ? <p className="muted" role="status">{status}</p> : null}
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      {files.length === 0 ? (
        <p className="muted">No files uploaded yet.</p>
      ) : (
        <ul className="file-list">
          {files.map((file) => (
            <li key={file.id}>
              <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="file-name">
                {file.name}
              </a>
              <span className="muted">
                {fileSize(file.size)} · {file.uploaded_by_name} · {file.uploaded_on}
              </span>
              <span className="file-actions">
                <a href={`/api/files/${file.id}?download=1`} className="button" aria-label={`Download ${file.name}`}>
                  <Download size={14} aria-hidden />
                </a>
                {file.can_remove ? (
                  <button type="button" className="danger" aria-label={`Remove ${file.name}`} onClick={() => remove(file.id)}>
                    <Trash2 size={14} aria-hidden />
                  </button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

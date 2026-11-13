'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { formatFileLinks, parseFileLinks, type FileLinkInput } from '@/lib/domain/deliverables';
import { label as humanize, money } from '@/lib/format';
import type { Column, Field, Row } from './types';

type FormState = Record<string, string | boolean | string[]>;
type Values = Record<string, unknown>;

/** Shows a short confirmation at the bottom of the screen (see Toast in the app shell). */
export function toast(message: string, tone: 'plain' | 'success' = 'plain') {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('app:toast', { detail: { message, tone } }));
}

// Saving one of these values is a moment worth marking: a task approved, a day
// verified, a request granted. The confirmation gets a tick instead of "Saved."
const MILESTONES: Record<string, string> = {
  approved: 'Approved',
  approve: 'Approved',
  verified: 'Verified',
  resolved: 'Resolved',
  acquired: 'Marked as acquired',
  completed: 'Completed',
};

function milestone(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const data = body as Record<string, unknown>;
  for (const key of ['status', 'review_status', 'decision']) {
    const text = MILESTONES[String(data[key] ?? '')];
    if (text) return text;
  }
  return null;
}

async function callApi(endpoint: string, method: string, body?: unknown): Promise<string | null> {
  try {
    const response = await fetch(endpoint, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.ok) {
      // 202 means the change was stored for an admin to approve rather than applied.
      const reached = response.status === 202 ? null : milestone(body);
      if (response.status === 202) toast('Sent to an admin for approval.');
      else if (reached) toast(reached, 'success');
      else toast(method === 'DELETE' ? 'Deleted.' : 'Saved.');
      return null;
    }
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    return payload?.error?.message ?? `Request failed (${response.status}).`;
  } catch {
    return 'Could not reach the server. Check your connection and try again.';
  }
}

function initialState(fields: Field[], initial?: Values): FormState {
  const state: FormState = {};
  for (const field of fields) {
    const value = initial?.[field.name];
    if (field.type === 'checkbox') state[field.name] = value === undefined ? true : Boolean(value);
    else if (field.type === 'multiselect') state[field.name] = Array.isArray(value) ? value.map(String) : [];
    else if (field.type === 'links') state[field.name] = formatFileLinks(value as FileLinkInput[] | null);
    else if (field.type === 'month') state[field.name] = value ? String(value).slice(0, 7) : '';
    else if (value === undefined) state[field.name] = field.defaultValue ?? '';
    else state[field.name] = value === null ? '' : String(value);
  }
  return state;
}

function serialize(fields: Field[], state: FormState): { values: Values; error?: string } {
  const values: Values = {};
  for (const field of fields) {
    const raw = state[field.name];
    if (field.type === 'checkbox') {
      values[field.name] = Boolean(raw);
      continue;
    }
    if (field.type === 'multiselect') {
      const chosen = Array.isArray(raw) ? raw : [];
      if (field.required && chosen.length === 0) return { values, error: `Choose at least one: ${field.label}.` };
      values[field.name] = chosen;
      continue;
    }
    const text = String(raw ?? '').trim();
    if (field.required && !text) return { values, error: `${field.label} is required.` };
    if (field.type === 'links') {
      const { links, invalid } = parseFileLinks(text);
      if (invalid.length > 0) return { values, error: `Not a valid link: ${invalid[0]}` };
      values[field.name] = links;
    } else if (field.type === 'number') {
      if (text && !Number.isFinite(Number(text))) return { values, error: `${field.label} must be a number.` };
      values[field.name] = text ? Number(text) : null;
    } else {
      values[field.name] = text || null;
    }
  }
  return { values };
}

function FieldForm({
  fields,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  resetOnSuccess,
}: {
  fields: Field[];
  initial?: Values;
  submitLabel: string;
  onSubmit: (values: Values) => Promise<string | null>;
  onCancel?: () => void;
  resetOnSuccess?: boolean;
}) {
  const [state, setState] = useState<FormState>(() => initialState(fields, initial));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (name: string, value: string | boolean | string[]) => setState((current) => ({ ...current, [name]: value }));

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const { values, error: problem } = serialize(fields, state);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    const message = await onSubmit(values);
    setBusy(false);
    setError(message);
    if (!message && resetOnSuccess) setState(initialState(fields, initial));
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="form-grid">
        {fields.map((field) => {
          const id = `field-${field.name}`;
          const value = state[field.name];
          const wide = field.type === 'textarea' || field.type === 'links' || field.type === 'multiselect';
          if (field.type === 'multiselect') {
            const chosen = Array.isArray(value) ? value : [];
            return (
              <div key={field.name} role="group" aria-label={field.label} className="field wide">
                <span>
                  {field.label}
                  {field.required ? ' *' : ''}
                </span>
                <div className="choices">
                  {(field.options ?? []).map((option) => (
                    <label key={option.value} className="choice">
                      <input
                        type="checkbox"
                        checked={chosen.includes(option.value)}
                        onChange={(event) =>
                          set(
                            field.name,
                            event.target.checked
                              ? [...chosen, option.value]
                              : chosen.filter((item) => item !== option.value),
                          )
                        }
                      />
                      {option.label}
                    </label>
                  ))}
                </div>
                {field.hint ? <small>{field.hint}</small> : null}
              </div>
            );
          }
          return (
            <label key={field.name} htmlFor={id} className={wide ? 'field wide' : 'field'}>
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.type === 'textarea' || field.type === 'links' ? (
                <textarea
                  id={id}
                  rows={3}
                  value={String(value)}
                  placeholder={field.type === 'links' ? 'One per line: Label | https://…' : field.placeholder}
                  onChange={(event) => set(field.name, event.target.value)}
                />
              ) : field.type === 'select' ? (
                <select id={id} value={String(value)} onChange={(event) => set(field.name, event.target.value)}>
                  <option value="">{field.required ? 'Choose…' : '—'}</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <input
                  id={id}
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(event) => set(field.name, event.target.checked)}
                />
              ) : (
                <input
                  id={id}
                  type={field.type ?? 'text'}
                  step={field.type === 'number' ? 'any' : undefined}
                  value={String(value)}
                  placeholder={field.placeholder}
                  onChange={(event) => set(field.name, event.target.value)}
                />
              )}
              {field.hint ? <small>{field.hint}</small> : null}
            </label>
          );
        })}
      </div>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="actions">
        <button type="submit" className="primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
        {onCancel ? (
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}

/** A standalone form that sends its fields to one endpoint. */
export function ApiForm({
  endpoint,
  method = 'POST',
  fields,
  initial,
  fixedValues,
  submitLabel = 'Save',
  resetOnSuccess = true,
}: {
  endpoint: string;
  method?: 'POST' | 'PATCH';
  fields: Field[];
  initial?: Values;
  fixedValues?: Values;
  submitLabel?: string;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return (
    <FieldForm
      fields={fields}
      initial={initial}
      submitLabel={submitLabel}
      resetOnSuccess={resetOnSuccess}
      onSubmit={async (values) => {
        const message = await callApi(endpoint, method, { ...values, ...fixedValues });
        if (!message) startTransition(() => router.refresh());
        return message;
      }}
    />
  );
}

/** A button that performs one API call, such as marking attendance. */
export function ActionButton({
  endpoint,
  method = 'POST',
  body,
  children,
  primary,
}: {
  endpoint: string;
  method?: 'POST' | 'PATCH' | 'DELETE';
  body?: Values;
  children: ReactNode;
  primary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    const message = await callApi(endpoint, method, body);
    setBusy(false);
    setError(message);
    if (!message) startTransition(() => router.refresh());
  }

  return (
    <span className="action">
      <button type="button" className={primary ? 'primary' : undefined} onClick={run} disabled={busy || refreshing}>
        {busy || refreshing ? 'Working…' : children}
      </button>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

function Cell({ row, column }: { row: Row; column: Column }) {
  const value = row[column.key];
  if (column.kind === 'links') {
    const links = (value as FileLinkInput[] | null) ?? [];
    if (links.length === 0) return <>—</>;
    return (
      <>
        {links.map((link) => (
          <a key={link.url} href={link.url} target="_blank" rel="noreferrer" className="chip">
            {link.label}
          </a>
        ))}
      </>
    );
  }
  if (column.kind === 'tags') {
    // Each tag is plain text, or { label, color } for a coloured label such as a role.
    const tags = (Array.isArray(value) ? value : []).map((tag) =>
      typeof tag === 'string' ? { label: tag, color: undefined } : (tag as { label: string; color?: string }),
    );
    if (tags.length === 0) return <>—</>;
    return (
      <span className="tags">
        {tags.map((tag) => (
          <span key={tag.label} className={tag.color ? `badge tag-${tag.color}` : 'badge'}>
            {tag.label}
          </span>
        ))}
      </span>
    );
  }
  if (value === null || value === undefined || value === '') return <>—</>;
  switch (column.kind) {
    case 'money':
      return <>{money(value as number)}</>;
    case 'number':
      return <>{Number(value).toLocaleString('en-US')}</>;
    case 'bool':
      return <>{value ? 'Yes' : 'No'}</>;
    case 'label':
      return <span className={`badge badge-${String(value)}`}>{humanize(String(value))}</span>;
    case 'nav':
      return <Link href={String(row[column.hrefKey ?? ''] ?? '#')}>{String(value)}</Link>;
    case 'link':
      return (
        <a href={String(row[column.hrefKey ?? column.key])} target="_blank" rel="noreferrer">
          {String(value)}
        </a>
      );
    default:
      return <>{String(value)}</>;
  }
}

/**
 * A table of records with add, edit and delete for people allowed to write.
 * Used by every module so that admin editing works the same everywhere.
 */
export function ResourceManager({
  title,
  description,
  endpoint,
  rows,
  columns,
  fields = [],
  editFields,
  fixedValues,
  canWrite = false,
  allowCreate = true,
  allowDelete = true,
  addLabel = 'Add',
  emptyText = 'Nothing here yet.',
  needsApproval = false,
  pageSize = 10,
}: {
  title: string;
  description?: string;
  endpoint: string;
  rows: Row[];
  columns: Column[];
  fields?: Field[];
  editFields?: Field[];
  fixedValues?: Values;
  canWrite?: boolean;
  allowCreate?: boolean;
  allowDelete?: boolean;
  addLabel?: string;
  emptyText?: string;
  /** The viewer is not an admin: their changes here go to an admin for approval. */
  needsApproval?: boolean;
  /** Rows shown before "Show all". Long lists also get a search box. */
  pageSize?: number;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Delete asks for confirmation inside the row. Browser confirm dialogs are
  // blocked in some embedded browsers, where Delete would silently do nothing.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // The row that was just saved flashes once.
  const [flashId, setFlashId] = useState<string | null>(null);
  // Forms close straight away; the table dims while the fresh rows arrive.
  const [refreshing, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  const formFields = editFields ?? fields;
  const canEdit = canWrite && formFields.length > 0;
  const canCreate = canWrite && allowCreate && fields.length > 0;
  const showActions = canWrite && (canEdit || allowDelete);

  async function remove(row: Row) {
    setConfirmingId(null);
    setDeletingId(row.id);
    const message = await callApi(`${endpoint}/${row.id}`, 'DELETE');
    setDeletingId(null);
    setError(message);
    if (!message) refresh();
  }

  // Long lists stay manageable: search across the visible columns, and show
  // the first page until "Show all" is pressed.
  const needle = search.trim().toLowerCase();
  const matching = needle
    ? rows.filter((row) =>
        columns.some((column) => {
          const value = row[column.key];
          const text = Array.isArray(value)
            ? value.map((item) => (typeof item === 'string' ? item : ((item as { label?: string }).label ?? ''))).join(' ')
            : String(value ?? '');
          return text.toLowerCase().includes(needle);
        }),
      )
    : rows;
  const visible = showAll || needle ? matching : matching.slice(0, pageSize);
  const hidden = matching.length - visible.length;

  return (
    <section className="panel">
      <header className="panel-header">
        <div>
          <h2>
            {title}
            {rows.length > 0 ? <span className="count">{rows.length}</span> : null}
          </h2>
          {description ? <p className="muted">{description}</p> : null}
          {needsApproval && canWrite ? <p className="muted">Changes you make here are sent to an admin for approval.</p> : null}
        </div>
        {canCreate && !adding ? (
          <button type="button" className="primary" onClick={() => setAdding(true)}>
            {addLabel}
          </button>
        ) : null}
      </header>

      {canCreate && adding ? (
        <FieldForm
          fields={fields}
          submitLabel={addLabel}
          onCancel={() => setAdding(false)}
          onSubmit={async (values) => {
            const message = await callApi(endpoint, 'POST', { ...values, ...fixedValues });
            if (!message) {
              setAdding(false);
              refresh();
            }
            return message;
          }}
        />
      ) : null}

      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}

      {rows.length > pageSize ? (
        <input
          type="search"
          className="search"
          value={search}
          placeholder={`Search ${rows.length} entries…`}
          aria-label={`Search ${title}`}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}

      {rows.length === 0 ? (
        <p className="muted empty">{emptyText}</p>
      ) : matching.length === 0 ? (
        <p className="muted empty">Nothing matches “{search}”.</p>
      ) : (
        <div className="table-wrap" data-pending={refreshing} aria-busy={refreshing}>
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} className={column.kind === 'money' || column.kind === 'number' ? 'num' : undefined}>
                    {column.label}
                  </th>
                ))}
                {showActions ? <th aria-label="Actions" /> : null}
              </tr>
            </thead>
            <tbody>
              {visible.map((row) =>
                editingId === row.id ? (
                  <tr key={row.id}>
                    <td colSpan={columns.length + 1}>
                      <FieldForm
                        fields={formFields}
                        initial={row}
                        submitLabel="Save changes"
                        onCancel={() => setEditingId(null)}
                        onSubmit={async (values) => {
                          const message = await callApi(`${endpoint}/${row.id}`, 'PATCH', values);
                          if (!message) {
                            setEditingId(null);
                            setFlashId(row.id);
                            window.setTimeout(() => setFlashId((current) => (current === row.id ? null : current)), 1600);
                            refresh();
                          }
                          return message;
                        }}
                      />
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id} data-pending={deletingId === row.id} className={flashId === row.id ? 'row-flash' : undefined}>
                    {columns.map((column) => (
                      <td key={column.key} className={column.kind === 'money' || column.kind === 'number' ? 'num' : undefined}>
                        <Cell row={row} column={column} />
                      </td>
                    ))}
                    {showActions ? (
                      <td className="row-actions">
                        {canEdit && confirmingId !== row.id ? (
                          <button type="button" onClick={() => setEditingId(row.id)}>
                            Edit
                          </button>
                        ) : null}
                        {allowDelete && confirmingId === row.id ? (
                          <>
                            <button type="button" className="danger" onClick={() => remove(row)} disabled={deletingId === row.id}>
                              Yes, delete
                            </button>
                            <button type="button" onClick={() => setConfirmingId(null)}>
                              Cancel
                            </button>
                          </>
                        ) : allowDelete ? (
                          <button type="button" className="danger" onClick={() => setConfirmingId(row.id)}>
                            Delete
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}

      {hidden > 0 ? (
        <div className="more">
          <button type="button" onClick={() => setShowAll(true)}>
            Show all {matching.length}
          </button>
        </div>
      ) : showAll && matching.length > pageSize ? (
        <div className="more">
          <button type="button" onClick={() => setShowAll(false)}>
            Show fewer
          </button>
        </div>
      ) : null}
    </section>
  );
}

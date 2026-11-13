import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodTypeAny } from 'zod';
import type { Profile } from '../../types/database';
import { fail, fromDbError, ok, readJson } from './http';

// Shared building blocks for the API routes. Every module's routes are thin
// configurations of these handlers, so permissions behave the same everywhere:
// admins can read and edit everything, everyone else gets what their roles allow,
// and row level security in the database backs both up.
//
// Writes come in two kinds. Admins (and the few cases a resource opens with
// `write`) change data directly. Anyone else whose roles include one of a
// resource's `propose` segments has their change stored as a change request,
// which an admin approves or denies.

/** 'member': anyone signed in. 'admin': admins only. A list: admins, or anyone whose roles include one of those segments. */
export type Access = 'member' | 'admin' | readonly string[];

export interface ApiContext {
  supabase: SupabaseClient;
  userId: string;
  profile: Profile;
  /** Segments the person's roles open up. Admins see everything regardless. */
  segments: ReadonlySet<string>;
  /** Segments the person may also edit. Left out means the same as `segments`. */
  editSegments?: ReadonlySet<string>;
  /** True for a real admin, including one who is currently viewing the app as another role. */
  realAdmin?: boolean;
  /** Set while an admin is viewing the app as another role. */
  preview?: { roleId: string; roleName: string };
}

export type ContextProvider = () => Promise<ApiContext | null>;

type Row = Record<string, unknown>;
type RouteParams = { params: Promise<{ id: string }> };

export interface ResourceConfig {
  table: string;
  /** What one record is called in a change request, e.g. "expense". */
  label?: string;
  select?: string;
  /** Who may list and fetch. Defaults to every member of the organization. */
  read?: Access;
  /** Who may create, edit and delete directly. Defaults to admins only. */
  write?: Access;
  /** Segments whose holders may propose changes for an admin to approve. */
  propose?: readonly string[];
  createSchema?: ZodTypeAny;
  updateSchema?: ZodTypeAny;
  /** Query string parameters that may be used as equality filters when listing. */
  filters?: string[];
  orderBy?: { column: string; ascending?: boolean };
  /** Extra columns set by the server on create or update (who did it, when). */
  onCreate?: (ctx: ApiContext, data: Row) => Row;
  onUpdate?: (ctx: ApiContext, data: Row) => Row;
  /** Values the server fixes on a proposed new record before it is stored for approval. */
  onPropose?: (ctx: ApiContext, data: Row) => Row;
  /**
   * For people who normally write directly: true sends this particular change
   * to an admin for approval instead (for example approving a deliverable).
   */
  approvalWhen?: (ctx: ApiContext, data: Row) => boolean | Promise<boolean>;
}

const isAdmin = (ctx: ApiContext) => ctx.profile.access_role === 'admin';
const holdsAny = (ctx: ApiContext, segments: readonly string[]) => segments.some((segment) => ctx.segments.has(segment));
/** Writing needs editing access, not just view access. */
const editsAny = (ctx: ApiContext, segments: readonly string[]) =>
  segments.some((segment) => (ctx.editSegments ?? ctx.segments).has(segment));

export async function authorize(
  getContext: ContextProvider,
  access: Access,
): Promise<{ ctx: ApiContext; response?: undefined } | { ctx?: undefined; response: Response }> {
  const ctx = await getContext();
  if (!ctx) return { response: fail(401, 'Please sign in.') };
  if (access === 'member' || isAdmin(ctx)) return { ctx };
  if (access === 'admin') return { response: fail(403, 'Only an admin can do that.') };
  if (!holdsAny(ctx, access)) return { response: fail(403, 'Your role does not include this section.') };
  return { ctx };
}

export type WriteMode = 'apply' | 'propose';

/**
 * Decides how a write is handled: applied directly, stored as a change request
 * for an admin, or refused.
 */
export async function authorizeWrite(
  getContext: ContextProvider,
  rules: { write?: Access; propose?: readonly string[] },
): Promise<{ ctx: ApiContext; mode: WriteMode; response?: undefined } | { ctx?: undefined; mode?: undefined; response: Response }> {
  const ctx = await getContext();
  if (!ctx) return { response: fail(401, 'Please sign in.') };
  const write = rules.write ?? 'admin';
  if (isAdmin(ctx) || write === 'member' || (write !== 'admin' && editsAny(ctx, write))) return { ctx, mode: 'apply' };
  if (rules.propose && editsAny(ctx, rules.propose)) return { ctx, mode: 'propose' };
  return { response: fail(403, rules.propose ? 'Your role can view this section but not change it.' : 'Only an admin can do that.') };
}

const NAME_KEYS = ['name', 'item_name', 'title', 'description', 'invoice_number', 'full_name', 'work_date', 'reason'];

/** The most recognisable text on a record, for a change request's summary. */
export function describeRecord(row: Row | null | undefined): string {
  if (!row) return '';
  for (const key of NAME_KEYS) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 80);
  }
  return '';
}

/**
 * "amount: 500, note: Taxi" for the fields a change touches. Internal ids are
 * left out, and so are empty fields unless `keepEmpty` (an edit that clears a field).
 */
export function describeFields(body: Row | null | undefined, keepEmpty = false): string {
  if (!body) return '';
  return Object.entries(body)
    .filter(([key]) => key !== 'id' && !key.endsWith('_id') && !key.endsWith('_ids'))
    .filter(([, value]) => value !== undefined && (value === null || typeof value !== 'object'))
    .filter(([, value]) => keepEmpty || (value !== null && value !== ''))
    .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value === null || value === '' ? 'empty' : String(value)}`)
    .join(', ')
    .slice(0, 300);
}

export function summarize(action: 'Add' | 'Change' | 'Delete', label: string, name: string, body?: Row | null): string {
  const subject = name ? `${label} "${name}"` : label;
  const fields = action === 'Delete' ? '' : describeFields(body, action === 'Change');
  return `${action} ${subject}${fields ? ` (${fields})` : ''}`;
}

/** Stores a change for an admin to approve, instead of applying it. Answers 202. */
export async function proposeChange(
  ctx: ApiContext,
  request: Request,
  body: Row | null,
  summary: string,
): Promise<Response> {
  const { error } = await ctx.supabase.from('change_requests').insert({
    org_id: ctx.profile.org_id,
    requested_by: ctx.userId,
    method: request.method,
    path: new URL(request.url).pathname,
    body,
    summary,
  });
  if (error) return fromDbError(error);
  return Response.json({ data: { pending: true, summary } }, { status: 202 });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A direct write by someone who is not an admin can still be sent for approval by the resource's own rule. */
async function settle(config: ResourceConfig, ctx: ApiContext, mode: WriteMode, data: Row): Promise<WriteMode> {
  if (mode !== 'apply' || isAdmin(ctx) || !config.approvalWhen) return mode;
  return (await config.approvalWhen(ctx, data)) ? 'propose' : 'apply';
}

export function makeCrud(getContext: ContextProvider) {
  function collection(config: ResourceConfig) {
    const select = config.select ?? '*';

    async function GET(request: Request): Promise<Response> {
      const auth = await authorize(getContext, config.read ?? 'member');
      if (auth.response) return auth.response;
      const { ctx } = auth;

      let query = ctx.supabase.from(config.table).select(select).eq('org_id', ctx.profile.org_id);
      const params = new URL(request.url).searchParams;
      for (const filter of config.filters ?? []) {
        const value = params.get(filter);
        if (value) query = query.eq(filter, value);
      }
      const order = config.orderBy ?? { column: 'created_at', ascending: false };
      const { data, error } = await query.order(order.column, { ascending: order.ascending ?? false });
      if (error) return fromDbError(error);
      return ok(data);
    }

    async function POST(request: Request): Promise<Response> {
      if (!config.createSchema) return fail(405, 'Creating is not supported here.');
      const auth = await authorizeWrite(getContext, config);
      if (auth.response) return auth.response;
      const { ctx } = auth;

      const body = await readJson(request, config.createSchema);
      if (body.response) return body.response;
      const mode = await settle(config, ctx, auth.mode, body.data as Row);

      if (mode === 'propose') {
        const input: Row = { ...(body.data as Row), ...(config.onPropose ? config.onPropose(ctx, body.data as Row) : {}) };
        return proposeChange(ctx, request, input, summarize('Add', config.label ?? config.table, describeRecord(input), input));
      }

      const row: Row = {
        ...(body.data as Row),
        ...(config.onCreate ? config.onCreate(ctx, body.data as Row) : {}),
        org_id: ctx.profile.org_id,
      };
      const { data, error } = await ctx.supabase.from(config.table).insert(row).select(select).single();
      if (error) return fromDbError(error);
      return ok(data, 201);
    }

    return { GET, POST };
  }

  function item(config: ResourceConfig) {
    const select = config.select ?? '*';

    /** A change can only be proposed for a record the person is able to see. */
    async function visibleRecord(ctx: ApiContext, id: string): Promise<Row | null> {
      const { data } = await ctx.supabase
        .from(config.table)
        .select('*')
        .eq('id', id)
        .eq('org_id', ctx.profile.org_id)
        .maybeSingle();
      return (data as Row | null) ?? null;
    }

    async function GET(_request: Request, { params }: RouteParams): Promise<Response> {
      const auth = await authorize(getContext, config.read ?? 'member');
      if (auth.response) return auth.response;
      const { ctx } = auth;
      const { id } = await params;
      if (!UUID.test(id)) return fail(404, 'Not found.');

      const { data, error } = await ctx.supabase
        .from(config.table)
        .select(select)
        .eq('id', id)
        .eq('org_id', ctx.profile.org_id)
        .maybeSingle();
      if (error) return fromDbError(error);
      if (!data) return fail(404, 'Not found.');
      return ok(data);
    }

    async function PATCH(request: Request, { params }: RouteParams): Promise<Response> {
      if (!config.updateSchema) return fail(405, 'Editing is not supported here.');
      const auth = await authorizeWrite(getContext, config);
      if (auth.response) return auth.response;
      const { ctx } = auth;
      const { id } = await params;
      if (!UUID.test(id)) return fail(404, 'Not found.');

      const body = await readJson(request, config.updateSchema);
      if (body.response) return body.response;
      if (Object.keys(body.data as Row).length === 0) return fail(400, 'Nothing to update.');
      const mode = await settle(config, ctx, auth.mode, body.data as Row);

      if (mode === 'propose') {
        const current = await visibleRecord(ctx, id);
        if (!current) return fail(404, 'Not found.');
        const input = body.data as Row;
        return proposeChange(ctx, request, input, summarize('Change', config.label ?? config.table, describeRecord(current), input));
      }

      const changes: Row = {
        ...(body.data as Row),
        ...(config.onUpdate ? config.onUpdate(ctx, body.data as Row) : {}),
      };
      const { data, error } = await ctx.supabase
        .from(config.table)
        .update(changes)
        .eq('id', id)
        .eq('org_id', ctx.profile.org_id)
        .select(select)
        .maybeSingle();
      if (error) return fromDbError(error);
      if (!data) return fail(404, 'Not found.');
      return ok(data);
    }

    async function DELETE(request: Request, { params }: RouteParams): Promise<Response> {
      const auth = await authorizeWrite(getContext, config);
      if (auth.response) return auth.response;
      const { ctx, mode } = auth;
      const { id } = await params;
      if (!UUID.test(id)) return fail(404, 'Not found.');

      if (mode === 'propose') {
        const current = await visibleRecord(ctx, id);
        if (!current) return fail(404, 'Not found.');
        return proposeChange(ctx, request, null, summarize('Delete', config.label ?? config.table, describeRecord(current)));
      }

      const { data, error } = await ctx.supabase
        .from(config.table)
        .delete()
        .eq('id', id)
        .eq('org_id', ctx.profile.org_id)
        .select('id')
        .maybeSingle();
      if (error) return fromDbError(error);
      if (!data) return fail(404, 'Not found.');
      return ok({ id });
    }

    return { GET, PATCH, DELETE };
  }

  return { collection, item };
}

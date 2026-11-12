import type { SupabaseClient } from '@supabase/supabase-js';
import type { ZodTypeAny } from 'zod';
import type { Profile } from '../../types/database';
import { fail, fromDbError, ok, readJson } from './http';

// Shared building blocks for the API routes. Every module's routes are thin
// configurations of these handlers, so permissions behave the same everywhere:
// admins can read and edit everything, employees get what `read`/`write` allow,
// and row level security in the database backs both up.

export type Access = 'member' | 'admin';

export interface ApiContext {
  supabase: SupabaseClient;
  userId: string;
  profile: Profile;
}

export type ContextProvider = () => Promise<ApiContext | null>;

type Row = Record<string, unknown>;
type RouteParams = { params: Promise<{ id: string }> };

export interface ResourceConfig {
  table: string;
  select?: string;
  /** Who may list and fetch. Defaults to every member of the organization. */
  read?: Access;
  /** Who may create, edit and delete. Defaults to admins only. */
  write?: Access;
  createSchema?: ZodTypeAny;
  updateSchema?: ZodTypeAny;
  /** Query string parameters that may be used as equality filters when listing. */
  filters?: string[];
  orderBy?: { column: string; ascending?: boolean };
  /** Extra columns set by the server on create or update (who did it, when). */
  onCreate?: (ctx: ApiContext, data: Row) => Row;
  onUpdate?: (ctx: ApiContext, data: Row) => Row;
}

export async function authorize(
  getContext: ContextProvider,
  access: Access,
): Promise<{ ctx: ApiContext; response?: undefined } | { ctx?: undefined; response: Response }> {
  const ctx = await getContext();
  if (!ctx) return { response: fail(401, 'Please sign in.') };
  if (access === 'admin' && ctx.profile.access_role !== 'admin') {
    return { response: fail(403, 'Only an admin can do that.') };
  }
  return { ctx };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      const auth = await authorize(getContext, config.write ?? 'admin');
      if (auth.response) return auth.response;
      const { ctx } = auth;

      const body = await readJson(request, config.createSchema);
      if (body.response) return body.response;

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
      const auth = await authorize(getContext, config.write ?? 'admin');
      if (auth.response) return auth.response;
      const { ctx } = auth;
      const { id } = await params;
      if (!UUID.test(id)) return fail(404, 'Not found.');

      const body = await readJson(request, config.updateSchema);
      if (body.response) return body.response;
      if (Object.keys(body.data as Row).length === 0) return fail(400, 'Nothing to update.');

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

    async function DELETE(_request: Request, { params }: RouteParams): Promise<Response> {
      const auth = await authorize(getContext, config.write ?? 'admin');
      if (auth.response) return auth.response;
      const { ctx } = auth;
      const { id } = await params;
      if (!UUID.test(id)) return fail(404, 'Not found.');

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

-- A minimal stand-in for what Supabase provides (roles, auth.users, auth.uid()),
-- so the migrations and tests/db/smoke.sql run on a plain PostgreSQL in CI.
create role anon nologin; create role authenticated nologin; create role service_role nologin;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to authenticated; grant usage on schema public to authenticated, anon;

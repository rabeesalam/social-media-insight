-- 0001_init_schema.sql
-- Core identity tables: profiles (web dashboard users), devices, avatars, platform_connections.
-- See docs/decisions/0002-secret-boundary-and-auth-model.md for the auth model this implements.

create extension if not exists pgcrypto;

create type app_role as enum ('admin', 'viewer');
create type device_status as enum ('online', 'offline', 'syncing', 'error', 'disabled');
create type platform_name as enum ('instagram', 'tiktok', 'youtube', 'facebook', 'threads', 'x');
create type connection_status as enum (
  'connected', 'reauthorization_required', 'error', 'disabled', 'pending'
);

-- ---------------------------------------------------------------------------
-- profiles: one row per web-dashboard user, mirrors auth.users
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'viewer');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- devices
-- ---------------------------------------------------------------------------
create table devices (
  id uuid primary key default gen_random_uuid(),
  device_uuid uuid not null unique,
  device_secret_hash text not null,
  device_name text not null default 'Unnamed device',
  status device_status not null default 'offline',
  app_version_name text,
  app_version_code integer,
  android_version text,
  device_model text,
  last_seen_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table avatars (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  name text not null,
  handle text,
  profile_image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- platform_connections
-- ---------------------------------------------------------------------------
create table platform_connections (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references avatars(id) on delete cascade,
  device_id uuid not null references devices(id) on delete cascade,
  platform platform_name not null,
  platform_account_id text,
  username text,
  display_name text,
  access_token_encrypted text,
  refresh_token_encrypted text,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  status connection_status not null default 'pending',
  last_sync_at timestamptz,
  last_error text,
  last_error_category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_connection_unique unique (platform, platform_account_id)
);

comment on column platform_connections.access_token_encrypted is
  'AES-256-GCM ciphertext. Never selectable by anon/authenticated roles — see 0005_rls_policies.sql. Only written by the oauth-exchange / get-access-token Edge Functions.';
comment on column platform_connections.refresh_token_encrypted is
  'AES-256-GCM ciphertext. Same access restrictions as access_token_encrypted.';

create function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger devices_set_updated_at before update on devices
  for each row execute function set_updated_at();
create trigger avatars_set_updated_at before update on avatars
  for each row execute function set_updated_at();
create trigger platform_connections_set_updated_at before update on platform_connections
  for each row execute function set_updated_at();
create trigger profiles_set_updated_at before update on profiles
  for each row execute function set_updated_at();

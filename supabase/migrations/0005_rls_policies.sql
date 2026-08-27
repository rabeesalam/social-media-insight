-- 0005_rls_policies.sql
-- Browser (anon/authenticated role via Supabase Auth) access only. Device access goes through
-- SECURITY DEFINER RPC functions in 0006_device_rpc_functions.sql and does NOT rely on these
-- policies (devices never authenticate as a Supabase Auth user). See ADR-0002.

create or replace function current_role_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

alter table profiles enable row level security;
alter table devices enable row level security;
alter table avatars enable row level security;
alter table platform_connections enable row level security;
alter table content_items enable row level security;
alter table platform_content enable row level security;
alter table metric_snapshots enable row level security;
alter table audience_metric_snapshots enable row level security;
alter table metric_metadata enable row level security;
alter table sync_jobs enable row level security;

-- profiles: everyone can read their own row; admins can read all.
create policy profiles_select_self on profiles for select
  using (id = auth.uid() or current_role_is_admin());
create policy profiles_update_self on profiles for update
  using (id = auth.uid());

-- devices: any authenticated dashboard user can view; only admins can register/disable/rename.
create policy devices_select_authenticated on devices for select
  using (auth.role() = 'authenticated');
create policy devices_admin_write on devices for all
  using (current_role_is_admin())
  with check (current_role_is_admin());

-- avatars: readable by any authenticated user; writable by admins only.
create policy avatars_select_authenticated on avatars for select
  using (auth.role() = 'authenticated');
create policy avatars_admin_write on avatars for all
  using (current_role_is_admin())
  with check (current_role_is_admin());

-- platform_connections: row-level access is granted to any authenticated user (viewers need to see
-- connection status per §33/§35), but column-level GRANTs (0007_views.sql) withhold the two token
-- columns from that role entirely. `select *` as `authenticated` therefore fails outright — the
-- frontend must go through the `platform_connections_safe` view, which only ever selects the
-- columns it actually has privilege on. This split (row-level via policy, column-level via GRANT)
-- is required because RLS itself has no concept of per-column visibility — a security_invoker view
-- built on a row-restricted-to-admins-only table would return zero rows to a non-admin, not a
-- redacted row, which would have silently hidden every connection's status from viewers.
create policy platform_connections_select_authenticated on platform_connections for select
  using (auth.role() = 'authenticated');
create policy platform_connections_admin_write on platform_connections for insert
  with check (current_role_is_admin());
create policy platform_connections_admin_update on platform_connections for update
  using (current_role_is_admin()) with check (current_role_is_admin());
create policy platform_connections_admin_delete on platform_connections for delete
  using (current_role_is_admin());

-- content_items / platform_content / metric_snapshots / audience_metric_snapshots / metric_metadata:
-- readable by any authenticated dashboard user (this is the actual analytics data), never
-- writable directly from the browser (only the RPC functions / Edge Functions write these).
create policy content_items_select_authenticated on content_items for select
  using (auth.role() = 'authenticated');
create policy platform_content_select_authenticated on platform_content for select
  using (auth.role() = 'authenticated');
create policy metric_snapshots_select_authenticated on metric_snapshots for select
  using (auth.role() = 'authenticated');
create policy audience_snapshots_select_authenticated on audience_metric_snapshots for select
  using (auth.role() = 'authenticated');
create policy metric_metadata_select_authenticated on metric_metadata for select
  using (auth.role() = 'authenticated');

create policy content_items_admin_write on content_items for all
  using (current_role_is_admin()) with check (current_role_is_admin());
create policy platform_content_admin_write on platform_content for all
  using (current_role_is_admin()) with check (current_role_is_admin());
create policy metric_metadata_admin_write on metric_metadata for all
  using (current_role_is_admin()) with check (current_role_is_admin());

-- sync_jobs: any authenticated user can read; any authenticated user can INSERT a pending job
-- requesting a refresh (self-attributed), but cannot forge another user's requested_by, cannot
-- insert with any status other than 'pending', and cannot update/delete (only RPC functions,
-- running as the device, transition job status).
create policy sync_jobs_select_authenticated on sync_jobs for select
  using (auth.role() = 'authenticated');
create policy sync_jobs_insert_own_request on sync_jobs for insert
  with check (
    auth.role() = 'authenticated'
    and requested_by = auth.uid()
    and status = 'pending'
  );
create policy sync_jobs_admin_manage on sync_jobs for update
  using (current_role_is_admin())
  with check (current_role_is_admin());
create policy sync_jobs_admin_delete on sync_jobs for delete
  using (current_role_is_admin());

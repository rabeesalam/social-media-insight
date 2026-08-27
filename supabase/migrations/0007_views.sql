-- 0007_views.sql — safe views for the browser: never expose token columns (§6/§41).
--
-- Column-level grant is the actual enforcement: `authenticated` never receives SELECT on
-- access_token_encrypted / refresh_token_encrypted, so even a hand-written query against the base
-- table (not just the view) fails with "permission denied for column" rather than merely being
-- discouraged by convention. The RLS policy on platform_connections (0005) grants row-level access
-- to all authenticated users; this column grant is what actually withholds the tokens.
grant select (
  id, avatar_id, device_id, platform, platform_account_id, username, display_name,
  token_expires_at, scopes, status, last_sync_at, last_error, last_error_category,
  created_at, updated_at
) on platform_connections to authenticated;

create view platform_connections_safe as
select
  id, avatar_id, device_id, platform, platform_account_id, username, display_name,
  token_expires_at, scopes, status, last_sync_at, last_error, last_error_category,
  created_at, updated_at
from platform_connections;

alter view platform_connections_safe set (security_invoker = on);

grant select on platform_connections_safe to authenticated;

-- Convenience view: latest metric snapshot per platform_content row (avoids a window-function
-- query in every dashboard page).
create view latest_metric_snapshots as
select distinct on (platform_content_id)
  *
from metric_snapshots
order by platform_content_id, captured_at desc;

alter view latest_metric_snapshots set (security_invoker = on);
grant select on latest_metric_snapshots to authenticated;

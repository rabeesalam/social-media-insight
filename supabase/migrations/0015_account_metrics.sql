-- 0015_account_metrics.sql
-- Follower/subscriber tracking, requested explicitly: a time-series per platform_connection
-- (distinct from audience_metric_snapshots, which holds dimension/value demographic breakdowns
-- like country=US — this is the simple "how many followers right now" number). Append-only, same
-- pattern as metric_snapshots, so follower growth over time is preserved, not overwritten.

create table account_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform_connection_id uuid not null references platform_connections(id) on delete cascade,
  captured_at timestamptz not null default now(),
  followers bigint,
  following bigint,
  raw_response jsonb
);

create index idx_account_metric_snapshots_connection_captured
  on account_metric_snapshots(platform_connection_id, captured_at desc);

alter table account_metric_snapshots enable row level security;

create policy account_metric_snapshots_select_authenticated on account_metric_snapshots for select
  using (auth.role() = 'authenticated');

create view latest_account_metric_snapshots as
select distinct on (platform_connection_id) *
from account_metric_snapshots
order by platform_connection_id, captured_at desc;

alter view latest_account_metric_snapshots set (security_invoker = on);
grant select on latest_account_metric_snapshots to authenticated;

-- Device-scoped write RPC, same validation pattern as insert_metric_snapshot (0006).
create function insert_account_metric_snapshot(
  p_device_uuid uuid,
  p_device_secret text,
  p_platform_connection_id uuid,
  p_followers bigint,
  p_following bigint,
  p_raw_response jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_result_id uuid;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  if not exists (
    select 1 from platform_connections
    where id = p_platform_connection_id and device_id = v_device_id
  ) then
    raise exception 'ownership_violation' using errcode = 'P0005';
  end if;

  insert into account_metric_snapshots (platform_connection_id, followers, following, raw_response)
  values (p_platform_connection_id, p_followers, p_following, p_raw_response)
  returning id into v_result_id;

  return v_result_id;
end;
$$;

grant execute on function insert_account_metric_snapshot to anon, authenticated;

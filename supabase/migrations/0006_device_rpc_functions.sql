-- 0006_device_rpc_functions.sql
-- SECURITY DEFINER RPC functions callable by the Android app using only the anon key.
-- Every function re-validates device_secret against the stored hash and checks ownership of the
-- target row before doing anything. This is the enforcement layer described in ADR-0002/§21/§34.

create function verify_device(p_device_uuid uuid, p_device_secret text)
returns uuid  -- returns devices.id on success, raises on failure
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device record;
begin
  select id, status, device_secret_hash into v_device
  from devices where device_uuid = p_device_uuid;

  if v_device is null then
    raise exception 'unknown_device' using errcode = 'P0001';
  end if;

  if v_device.status = 'disabled' then
    raise exception 'device_disabled' using errcode = 'P0002';
  end if;

  if v_device.device_secret_hash <> encode(digest(p_device_secret, 'sha256'), 'hex') then
    raise exception 'invalid_device_secret' using errcode = 'P0003';
  end if;

  return v_device.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- register_device: called once per physical device on first app launch.
-- Returns the plaintext device_secret exactly once; caller must store it securely.
-- ---------------------------------------------------------------------------
create function register_device(
  p_device_uuid uuid,
  p_device_name text,
  p_app_version_name text,
  p_app_version_code integer,
  p_android_version text,
  p_device_model text
)
returns table (device_id uuid, device_secret text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_id uuid;
begin
  if exists (select 1 from devices where device_uuid = p_device_uuid) then
    raise exception 'device_already_registered' using errcode = 'P0004';
  end if;

  v_secret := encode(gen_random_bytes(32), 'hex');

  insert into devices (
    device_uuid, device_secret_hash, device_name, status,
    app_version_name, app_version_code, android_version, device_model, last_seen_at
  ) values (
    p_device_uuid, encode(digest(v_secret, 'sha256'), 'hex'), p_device_name, 'online',
    p_app_version_name, p_app_version_code, p_android_version, p_device_model, now()
  ) returning id into v_id;

  return query select v_id, v_secret;
end;
$$;

-- ---------------------------------------------------------------------------
-- device_heartbeat: cheap status/liveness update, called periodically and at app open.
-- ---------------------------------------------------------------------------
create function device_heartbeat(
  p_device_uuid uuid,
  p_device_secret text,
  p_status device_status default 'online',
  p_app_version_name text default null,
  p_app_version_code integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  update devices set
    status = p_status,
    last_seen_at = now(),
    app_version_name = coalesce(p_app_version_name, app_version_name),
    app_version_code = coalesce(p_app_version_code, app_version_code)
  where id = v_device_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_avatar: device creates/updates one of its own avatars.
-- ---------------------------------------------------------------------------
create function upsert_avatar(
  p_device_uuid uuid,
  p_device_secret text,
  p_avatar_id uuid,       -- null to create
  p_name text,
  p_handle text default null,
  p_profile_image_url text default null
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

  if p_avatar_id is not null then
    if not exists (select 1 from avatars where id = p_avatar_id and device_id = v_device_id) then
      raise exception 'ownership_violation' using errcode = 'P0005';
    end if;
    update avatars set name = p_name, handle = p_handle, profile_image_url = p_profile_image_url
    where id = p_avatar_id
    returning id into v_result_id;
  else
    insert into avatars (device_id, name, handle, profile_image_url)
    values (v_device_id, p_name, p_handle, p_profile_image_url)
    returning id into v_result_id;
  end if;

  return v_result_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_next_sync_job: atomically claims the highest-priority pending job for this device.
-- ---------------------------------------------------------------------------
create function claim_next_sync_job(p_device_uuid uuid, p_device_secret text)
returns sync_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_job sync_jobs;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  select * into v_job from sync_jobs
  where device_id = v_device_id and status = 'pending'
  order by priority asc, created_at asc
  limit 1
  for update skip locked;

  if v_job.id is null then
    return null;
  end if;

  update sync_jobs set status = 'claimed', claimed_at = now()
  where id = v_job.id
  returning * into v_job;

  update devices set status = 'syncing' where id = v_device_id;

  return v_job;
end;
$$;

-- ---------------------------------------------------------------------------
-- start_sync_job / complete_sync_job: status transitions, idempotent — completing an
-- already-completed/cancelled job is a no-op rather than an error, so duplicate delivery of the
-- same command never causes duplicate side effects (§21).
-- ---------------------------------------------------------------------------
create function start_sync_job(p_device_uuid uuid, p_device_secret text, p_job_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  update sync_jobs set status = 'running', started_at = now()
  where id = p_job_id and device_id = v_device_id and status = 'claimed';
end;
$$;

create function complete_sync_job(
  p_device_uuid uuid,
  p_device_secret text,
  p_job_id uuid,
  p_status sync_job_status, -- 'completed' or 'failed'
  p_result_summary jsonb default null,
  p_error_message text default null,
  p_error_category text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
  v_job sync_jobs;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  select * into v_job from sync_jobs where id = p_job_id and device_id = v_device_id;
  if v_job.id is null then
    raise exception 'ownership_violation' using errcode = 'P0005';
  end if;

  -- idempotent: already-terminal jobs are left alone
  if v_job.status in ('completed', 'failed', 'cancelled') then
    return;
  end if;

  if p_status = 'failed' and v_job.retry_count < v_job.max_retries then
    update sync_jobs set
      status = 'pending', retry_count = retry_count + 1,
      error_message = p_error_message, error_category = p_error_category
    where id = p_job_id;
  else
    update sync_jobs set
      status = p_status, completed_at = now(), result_summary = p_result_summary,
      error_message = p_error_message, error_category = p_error_category
    where id = p_job_id;
  end if;

  update devices set status = 'online', last_sync_at = now() where id = v_device_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- upsert_platform_content + insert_metric_snapshot + insert_audience_metric_snapshot:
-- the normalized-data write path used after every successful platform API fetch.
-- ---------------------------------------------------------------------------
create function upsert_platform_content(
  p_device_uuid uuid,
  p_device_secret text,
  p_platform_connection_id uuid,
  p_platform platform_name,
  p_platform_media_id text,
  p_public_url text,
  p_title text,
  p_caption text,
  p_thumbnail_url text,
  p_media_type media_type,
  p_published_at timestamptz
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

  insert into platform_content (
    platform_connection_id, platform, platform_media_id, public_url,
    title, caption, thumbnail_url, media_type, published_at
  ) values (
    p_platform_connection_id, p_platform, p_platform_media_id, p_public_url,
    p_title, p_caption, p_thumbnail_url, p_media_type, p_published_at
  )
  on conflict (platform, platform_media_id) do update set
    public_url = excluded.public_url,
    title = excluded.title,
    caption = excluded.caption,
    thumbnail_url = excluded.thumbnail_url,
    updated_at = now()
  returning id into v_result_id;

  return v_result_id;
end;
$$;

create function insert_metric_snapshot(
  p_device_uuid uuid,
  p_device_secret text,
  p_platform_content_id uuid,
  p_views bigint, p_likes bigint, p_comments bigint, p_shares bigint, p_saves bigint,
  p_watch_time_seconds bigint, p_average_watch_time_seconds numeric, p_engagement_rate numeric,
  p_raw_response jsonb, p_metric_status text default 'ok'
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
    select 1 from platform_content pc
    join platform_connections conn on conn.id = pc.platform_connection_id
    where pc.id = p_platform_content_id and conn.device_id = v_device_id
  ) then
    raise exception 'ownership_violation' using errcode = 'P0005';
  end if;

  insert into metric_snapshots (
    platform_content_id, views, likes, comments, shares, saves,
    watch_time_seconds, average_watch_time_seconds, engagement_rate, raw_response, metric_status
  ) values (
    p_platform_content_id, p_views, p_likes, p_comments, p_shares, p_saves,
    p_watch_time_seconds, p_average_watch_time_seconds, p_engagement_rate, p_raw_response, p_metric_status
  ) returning id into v_result_id;

  return v_result_id;
end;
$$;

create function insert_audience_metric_snapshot(
  p_device_uuid uuid,
  p_device_secret text,
  p_platform_connection_id uuid,
  p_platform_content_id uuid,
  p_dimension text, p_dimension_value text, p_metric_name text, p_metric_value numeric,
  p_date_range_start date, p_date_range_end date, p_raw_response jsonb
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

  insert into audience_metric_snapshots (
    platform_connection_id, platform_content_id, dimension, dimension_value,
    metric_name, metric_value, date_range_start, date_range_end, raw_response
  ) values (
    p_platform_connection_id, p_platform_content_id, p_dimension, p_dimension_value,
    p_metric_name, p_metric_value, p_date_range_start, p_date_range_end, p_raw_response
  ) returning id into v_result_id;

  return v_result_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- update_connection_status: device reports a connection's health (connected / reauth needed / error)
-- ---------------------------------------------------------------------------
create function update_connection_status(
  p_device_uuid uuid,
  p_device_secret text,
  p_platform_connection_id uuid,
  p_status connection_status,
  p_last_error text default null,
  p_last_error_category text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  update platform_connections set
    status = p_status, last_error = p_last_error, last_error_category = p_last_error_category,
    last_sync_at = case when p_status = 'connected' then now() else last_sync_at end
  where id = p_platform_connection_id and device_id = v_device_id;
end;
$$;

-- Lock down: revoke default PUBLIC execute, grant only to anon+authenticated (the roles the
-- Android app and browser actually use via PostgREST/RPC).
--
-- NOTE on current_role_is_admin(): it is defined in 0005_rls_policies.sql and is invoked directly
-- from RLS policy USING/WITH CHECK expressions, which execute as the querying role (authenticated),
-- not "wrapped" inside another SECURITY DEFINER function body. SECURITY DEFINER only changes whose
-- privileges apply *inside* the function; the caller still needs EXECUTE to invoke it at all. It
-- must therefore be explicitly re-granted here, or every RLS policy that calls it starts failing
-- with "permission denied for function" the moment the PUBLIC revoke below runs. verify_device()
-- does NOT need this treatment: it is only ever called from inside other functions owned by the
-- same role (register_device, claim_next_sync_job, etc.), and an owner always has implicit EXECUTE
-- on its own objects regardless of PUBLIC grants — so it stays locked down intentionally.
revoke execute on all functions in schema public from public;
grant execute on function current_role_is_admin() to authenticated, anon;
grant execute on function
  register_device, device_heartbeat, upsert_avatar, claim_next_sync_job, start_sync_job,
  complete_sync_job, upsert_platform_content, insert_metric_snapshot,
  insert_audience_metric_snapshot, update_connection_status
  to anon, authenticated;

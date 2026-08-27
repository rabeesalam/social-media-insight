-- 0012_content_lookup_rpc.sql
-- claim_next_sync_job only returns the sync_jobs row itself (platform_content_id, platform_connection_id
-- as opaque FKs) — the worker needs the actual platform_media_id to call the platform's API, and
-- the platform enum to dispatch to the right adapter. Small, additive, device-scoped read RPC.

create function get_platform_content_for_device(
  p_device_uuid uuid,
  p_device_secret text,
  p_platform_content_id uuid
)
returns table (
  platform_media_id text,
  platform platform_name,
  platform_connection_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  return query
    select pc.platform_media_id, pc.platform, pc.platform_connection_id
    from platform_content pc
    join platform_connections conn on conn.id = pc.platform_connection_id
    where pc.id = p_platform_content_id and conn.device_id = v_device_id;
end;
$$;

grant execute on function get_platform_content_for_device to anon, authenticated;

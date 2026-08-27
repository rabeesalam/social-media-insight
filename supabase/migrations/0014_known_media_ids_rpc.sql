-- 0014_known_media_ids_rpc.sql
-- Lets the worker know which content it's already discovered for a connection, so pagination
-- (YouTubeAdapter.listContent) can stop as soon as it hits an already-known video instead of
-- re-walking the channel's entire history every sync cycle. Device-scoped, same pattern as every
-- other device-facing read RPC (0008/0012).

create function list_known_media_ids_for_device(
  p_device_uuid uuid,
  p_device_secret text,
  p_platform_connection_id uuid
)
returns setof text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);

  if not exists (
    select 1 from platform_connections
    where id = p_platform_connection_id and device_id = v_device_id
  ) then
    raise exception 'ownership_violation' using errcode = 'P0005';
  end if;

  return query
    select platform_media_id from platform_content
    where platform_connection_id = p_platform_connection_id;
end;
$$;

grant execute on function list_known_media_ids_for_device to anon, authenticated;

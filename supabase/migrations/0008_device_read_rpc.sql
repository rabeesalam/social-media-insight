-- 0008_device_read_rpc.sql
-- The Android app authenticates as `anon` + a per-device secret (ADR-0002), never as a Supabase
-- Auth `authenticated` user — so the read-side RLS policies in 0005 (which gate on
-- auth.role() = 'authenticated') do not let it read back its own avatars/connections via a plain
-- REST select. These RPC functions are the device's read path, mirroring the write-side pattern
-- from 0006_device_rpc_functions.sql: verify_device() first, then return only that device's rows.

create function list_avatars_for_device(p_device_uuid uuid, p_device_secret text)
returns setof avatars
language plpgsql
security definer
set search_path = public
as $$
declare
  v_device_id uuid;
begin
  v_device_id := verify_device(p_device_uuid, p_device_secret);
  return query select * from avatars where device_id = v_device_id order by name;
end;
$$;

-- Token columns are never selected here, even though this runs as a SECURITY DEFINER owner that
-- technically could — the function body itself simply never references access_token_encrypted /
-- refresh_token_encrypted, so there's nothing to withhold at the RLS layer here (there's no
-- column-level grant trick needed for a function's own explicit column list).
create function list_platform_connections_for_device(p_device_uuid uuid, p_device_secret text)
returns table (
  id uuid, avatar_id uuid, device_id uuid, platform platform_name,
  platform_account_id text, username text, display_name text,
  token_expires_at timestamptz, scopes text[], status connection_status,
  last_sync_at timestamptz, last_error text, last_error_category text,
  created_at timestamptz, updated_at timestamptz
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
    select
      pc.id, pc.avatar_id, pc.device_id, pc.platform,
      pc.platform_account_id, pc.username, pc.display_name,
      pc.token_expires_at, pc.scopes, pc.status,
      pc.last_sync_at, pc.last_error, pc.last_error_category,
      pc.created_at, pc.updated_at
    from platform_connections pc
    where pc.device_id = v_device_id
    order by pc.platform;
end;
$$;

grant execute on function list_avatars_for_device, list_platform_connections_for_device
  to anon, authenticated;

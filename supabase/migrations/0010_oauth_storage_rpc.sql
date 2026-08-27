-- 0010_oauth_storage_rpc.sql
-- Called only by the oauth-exchange Edge Function (service_role), never by the Android app or
-- browser directly — the app never sees a raw platform access/refresh token (ADR-0002). The Edge
-- Function still passes device_uuid/device_secret through so this function can independently
-- re-validate that the request really originated from that device and that the avatar belongs to
-- it, exactly like every other device-write RPC — trusting the Edge Function's caller without
-- re-checking would mean a stolen anon key alone (not device-bound) could write connections.

create function store_oauth_connection(
  p_device_uuid uuid,
  p_device_secret text,
  p_avatar_id uuid,
  p_platform platform_name,
  p_platform_account_id text,
  p_username text,
  p_display_name text,
  p_access_token_encrypted text,
  p_refresh_token_encrypted text,
  p_token_expires_at timestamptz,
  p_scopes text[]
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

  if not exists (select 1 from avatars where id = p_avatar_id and device_id = v_device_id) then
    raise exception 'ownership_violation' using errcode = 'P0005';
  end if;

  insert into platform_connections (
    avatar_id, device_id, platform, platform_account_id, username, display_name,
    access_token_encrypted, refresh_token_encrypted, token_expires_at, scopes, status
  ) values (
    p_avatar_id, v_device_id, p_platform, p_platform_account_id, p_username, p_display_name,
    p_access_token_encrypted, p_refresh_token_encrypted, p_token_expires_at, p_scopes, 'connected'
  )
  on conflict (platform, platform_account_id) do update set
    avatar_id = excluded.avatar_id,
    device_id = excluded.device_id,
    username = excluded.username,
    display_name = excluded.display_name,
    access_token_encrypted = excluded.access_token_encrypted,
    refresh_token_encrypted = excluded.refresh_token_encrypted,
    token_expires_at = excluded.token_expires_at,
    scopes = excluded.scopes,
    status = 'connected',
    last_error = null,
    last_error_category = null,
    updated_at = now()
  returning id into v_result_id;

  return v_result_id;
end;
$$;

-- service_role only — the Android app must never be able to call this directly (it has no way to
-- produce a legitimately encrypted token anyway, but defense in depth: don't even expose the
-- function to anon/authenticated).
grant execute on function store_oauth_connection to service_role;

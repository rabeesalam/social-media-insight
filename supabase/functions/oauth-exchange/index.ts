// oauth-exchange Edge Function
//
// The only place any platform's client_secret exists (as a Supabase Function secret) and the
// only place a raw platform access/refresh token exists outside the encrypted DB column — never
// in the Android app, never in the browser. See docs/decisions/0002-secret-boundary-and-auth-model.md.
//
// Request body: { device_uuid, device_secret, avatar_id, platform, code, code_verifier, redirect_uri }
// Response: { status: "connected" | "error", platform_username?, connection_id?, error? }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { encryptToken } from "../_shared/crypto.ts";
import { exchangeCodeForToken, fetchAccountInfo } from "../_shared/platforms.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ExchangeRequest {
  device_uuid: string;
  device_secret: string;
  avatar_id: string;
  platform: string;
  code: string;
  code_verifier: string;
  redirect_uri: string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ status: "error", error: "method_not_allowed" }, { status: 405 });
  }

  let body: ExchangeRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ status: "error", error: "invalid_json" }, { status: 400 });
  }

  const { device_uuid, device_secret, avatar_id, platform, code, code_verifier, redirect_uri } = body;
  if (!device_uuid || !device_secret || !avatar_id || !platform || !code || !redirect_uri) {
    return Response.json({ status: "error", error: "missing_fields" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Cheap pre-check before spending a call on the platform's token endpoint — the authoritative
  // check happens again inside store_oauth_connection (SECURITY DEFINER), so a bug here can't
  // itself become a security hole, only an availability one.
  const { data: device } = await supabase
    .from("devices")
    .select("device_secret_hash, status")
    .eq("device_uuid", device_uuid)
    .maybeSingle();

  if (!device || device.status === "disabled") {
    return Response.json({ status: "error", error: "unknown_or_disabled_device" }, { status: 403 });
  }
  if (device.device_secret_hash !== (await sha256Hex(device_secret))) {
    return Response.json({ status: "error", error: "invalid_device_secret" }, { status: 403 });
  }

  try {
    const tokenResponse = await exchangeCodeForToken(platform, code, code_verifier, redirect_uri);
    const account = await fetchAccountInfo(platform, tokenResponse.access_token);

    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null;

    const { data: connectionId, error: rpcError } = await supabase.rpc("store_oauth_connection", {
      p_device_uuid: device_uuid,
      p_device_secret: device_secret,
      p_avatar_id: avatar_id,
      p_platform: platform,
      p_platform_account_id: account.platform_account_id,
      p_username: account.username,
      p_display_name: account.display_name,
      p_access_token_encrypted: await encryptToken(tokenResponse.access_token),
      p_refresh_token_encrypted: tokenResponse.refresh_token ? await encryptToken(tokenResponse.refresh_token) : null,
      p_token_expires_at: expiresAt,
      p_scopes: [], // TODO: thread the actually-granted scopes through once a platform's token response reliably reports them
    });

    if (rpcError) {
      return Response.json({ status: "error", error: rpcError.message }, { status: 500 });
    }

    return Response.json({
      status: "connected",
      platform_username: account.username ?? account.display_name,
      connection_id: connectionId,
    });
  } catch (e) {
    // Never leak provider error internals verbatim to a field the app might show raw (§35) —
    // but do return enough to be actionable, since this response IS meant for a developer-visible
    // "diagnostics" path, not the plain end-user status label (that's derived from `status` alone).
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ status: "error", error: message }, { status: 502 });
  }
});

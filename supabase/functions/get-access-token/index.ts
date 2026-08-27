// get-access-token Edge Function
//
// The Android app calls this before making any platform API call. It never receives a
// refresh_token or client_secret — only a short-lived access_token, held in memory for the
// duration of one sync job and never persisted to disk. Refresh (when needed) happens here,
// server-side, using whichever mechanism the platform actually supports (see _shared/platforms.ts
// — refresh_token grant for TikTok/YouTube/X, self-refresh-by-presenting-the-token for Meta's
// Threads/Instagram/Facebook). See docs/decisions/0002-secret-boundary-and-auth-model.md.
//
// Request body: { device_uuid, device_secret, platform_connection_id }
// Response: { status: "ok", access_token, expires_at } | { status: "error", error }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptToken, encryptToken } from "../_shared/crypto.ts";
import { refreshAccessToken } from "../_shared/platforms.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh if expiring within 5 minutes

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ status: "error", error: "method_not_allowed" }, { status: 405 });
  }

  let body: { device_uuid?: string; device_secret?: string; platform_connection_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ status: "error", error: "invalid_json" }, { status: 400 });
  }

  const { device_uuid, device_secret, platform_connection_id } = body;
  if (!device_uuid || !device_secret || !platform_connection_id) {
    return Response.json({ status: "error", error: "missing_fields" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: device } = await supabase
    .from("devices")
    .select("id, device_secret_hash, status")
    .eq("device_uuid", device_uuid)
    .maybeSingle();

  if (!device || device.status === "disabled") {
    return Response.json({ status: "error", error: "unknown_or_disabled_device" }, { status: 403 });
  }
  if (device.device_secret_hash !== (await sha256Hex(device_secret))) {
    return Response.json({ status: "error", error: "invalid_device_secret" }, { status: 403 });
  }

  const { data: connection } = await supabase
    .from("platform_connections")
    .select("id, device_id, platform, status, access_token_encrypted, refresh_token_encrypted, token_expires_at")
    .eq("id", platform_connection_id)
    .maybeSingle();

  if (!connection || connection.device_id !== device.id) {
    return Response.json({ status: "error", error: "ownership_violation" }, { status: 403 });
  }
  if (connection.status === "disabled" || !connection.access_token_encrypted) {
    return Response.json({ status: "error", error: "connection_not_active" }, { status: 409 });
  }

  try {
    const currentAccessToken = await decryptToken(connection.access_token_encrypted);
    const expiresAt = connection.token_expires_at ? new Date(connection.token_expires_at) : null;
    const needsRefresh = expiresAt !== null && expiresAt.getTime() - Date.now() < REFRESH_BUFFER_MS;

    if (!needsRefresh) {
      return Response.json({ status: "ok", access_token: currentAccessToken, expires_at: connection.token_expires_at });
    }

    const refreshToken = connection.refresh_token_encrypted ? await decryptToken(connection.refresh_token_encrypted) : null;
    const refreshed = await refreshAccessToken(connection.platform, currentAccessToken, refreshToken);
    const newExpiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : null;

    await supabase
      .from("platform_connections")
      .update({
        access_token_encrypted: await encryptToken(refreshed.access_token),
        refresh_token_encrypted: refreshed.refresh_token ? await encryptToken(refreshed.refresh_token) : connection.refresh_token_encrypted,
        token_expires_at: newExpiresAt,
        status: "connected",
        last_error: null,
        last_error_category: null,
      })
      .eq("id", platform_connection_id);

    return Response.json({ status: "ok", access_token: refreshed.access_token, expires_at: newExpiresAt });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    // A failed refresh means reauthorization is genuinely required — reflect that in the
    // connection's own status so the dashboard shows it accurately (§33), not just in this response.
    await supabase
      .from("platform_connections")
      .update({ status: "reauthorization_required", last_error: message, last_error_category: "refresh_failed" })
      .eq("id", platform_connection_id);

    return Response.json({ status: "error", error: message }, { status: 502 });
  }
});

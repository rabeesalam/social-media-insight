# ADR-0002: Secret boundary and auth model

## Status
Accepted — 2026-08-25

## Context
Three actors touch the system: the web dashboard (untrusted browser), the Android app (semi-trusted
device we control physically, but its APK can be decompiled so it must not hold long-lived secrets),
and Supabase itself (fully trusted, holds the service-role key and platform client secrets as Edge
Function secrets).

## Decision

### Device identity (Android ↔ Supabase)
- On first run, the app generates a random UUID (`device_uuid`) and calls `register_device()`
  (Postgres RPC, callable with the anon key). The function returns a freshly generated
  `device_secret` **once**; only `sha256(device_secret)` is stored server-side
  (`devices.device_secret_hash`).
- The app stores `device_uuid` + `device_secret` in `EncryptedSharedPreferences` backed by Android
  Keystore (never plain `SharedPreferences`).
- Every subsequent device-originated RPC call (`claim_next_sync_job`, `complete_sync_job`,
  `upsert_platform_connection`, `insert_platform_content`, `insert_metric_snapshot`, device
  heartbeat, etc.) takes `device_uuid` + `device_secret` as arguments. Each function is
  `SECURITY DEFINER`, re-hashes the provided secret, compares to the stored hash, and rejects the
  call (`ownership_violation`/`invalid_device_secret`) if it doesn't match, or if the target row
  (avatar/connection/job) doesn't belong to that device. This is the "never trust device-provided
  avatar/account mappings without server validation" requirement (§21/§34 of the product spec) —
  enforced in the database itself, not in application code that could be bypassed.
- Disabling a device (`devices.status = 'disabled'`) is checked at the top of every device RPC —
  a disabled device's calls fail immediately, satisfying the phone-replacement/revocation
  requirement (§44).

### OAuth secrets (client_secret, refresh_token)
- The Android app opens the platform's official authorization page (Custom Tab / PKCE), receives
  the redirect with an authorization `code`.
- The app POSTs `{device_uuid, device_secret, platform, code, code_verifier, redirect_uri}` to the
  `oauth-exchange` Supabase Edge Function. This function (not the app) holds each platform's
  `client_secret` as a Supabase Function secret, performs the token exchange, encrypts the
  resulting access/refresh tokens (AES-256-GCM, key from a Supabase secret, never the anon or
  service-role key itself) and writes them straight into `platform_connections` via the
  service-role client available inside the Edge Function runtime. The raw tokens are never
  returned to the app — only `{status, platform_username, connection_id}`.
- When the Android app needs to make a platform API call, it requests a short-lived access token
  from the `get-access-token` Edge Function (`device_uuid`, `device_secret`, `platform_connection_id`).
  That function validates device ownership, decrypts the stored token, refreshes it first if it's
  within its expiry buffer (using the stored refresh_token + the platform's client_secret, still
  server-side), persists the refreshed token, and returns only the current access token to the app
  over HTTPS. The app holds it in memory for the duration of one sync job and never persists it to
  disk. This keeps `client_secret` and `refresh_token` exclusively server-side while still letting
  the actual data-fetch HTTP request originate from the phone's own network path (ADR-0006).

### Web dashboard auth (browser ↔ Supabase)
- Supabase Auth (email/password to start; magic link is a cheap upgrade later) with a `profiles`
  table (`id` = `auth.users.id`, `role` in `admin`/`viewer`).
- Browser uses the **anon key only**. RLS policies (see migration `0005_rls_policies.sql`) grant:
  - `admin`: full read on all normalized tables, insert/update on `avatars`, `devices` (rename/
    disable), and `sync_jobs`.
  - `viewer`: read-only on normalized tables, insert-only on `sync_jobs` (to request a refresh),
    with a check constraint that `requested_by = auth.uid()`.
- Token columns (`access_token_encrypted`, `refresh_token_encrypted`) on `platform_connections` are
  **not** selectable by any browser-facing role — direct table grants exclude those columns, and the
  frontend reads through the `platform_connections_safe` view instead. The service-role key that
  *can* see them is never sent to the browser (Next.js API routes are the only server-side code
  allowed to construct a service-role client, and only for admin mutations that must bypass RLS,
  e.g. disabling a device).

## Consequences
- No component other than Supabase Edge Functions ever sees a platform `client_secret`.
- A decompiled APK yields nothing more sensitive than a per-device secret that only unlocks that
  one device's own rows, and short-lived access tokens that expire on their own.
- All device-writable mutations are enforced twice: once by the RPC function's own checks, and once
  implicitly by Postgres RLS as a defense-in-depth backstop (RPC functions still run inside a
  database with RLS enabled; they use SECURITY DEFINER deliberately and narrowly, not as a blanket
  bypass).

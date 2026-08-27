# ADR-0001: Overall architecture — no VPS, Supabase-centric, personal scale

## Status
Accepted — 2026-08-25

## Context
Personal/internal system for ~4 Android phones × 2 avatars × up to 6 platforms (~48 connected
accounts). Must avoid enterprise-scale infrastructure (rule: no Kubernetes, no microservices, no
message buses) while still being secure (no client secrets in the APK or browser bundle) and
reliable (device offline handling, retries, token refresh).

## Decision
Three components, no VPS:

1. **Android app** (Kotlin + Jetpack Compose) — the only component that calls social-platform
   data APIs. It performs the actual HTTP calls to Instagram/TikTok/YouTube/Facebook/Threads/X
   over the phone's normal network stack (so the phone's existing proxy/VPN configuration is
   respected — see ADR-0006). It never holds a platform client_secret.
2. **Supabase** — Postgres database, Auth (web dashboard login only), and a small number of Edge
   Functions used *only* for the operations that require a platform client_secret (OAuth
   authorization-code exchange and refresh-token exchange). Everything else the Android app needs
   (device registration, job claiming, writing normalized content/metrics) goes through
   `SECURITY DEFINER` Postgres RPC functions that validate a per-device secret — no separate
   backend server needed for that.
3. **Web dashboard** (Next.js, deployed to Vercel) — reads normalized data from Supabase via the
   anon key + Row Level Security, authenticated with Supabase Auth (admin/viewer roles). It can
   create `sync_jobs` rows to request a refresh, but never reads or writes access/refresh tokens
   directly, and the Supabase **service-role key is never sent to the browser**.

## Why not a VPS / custom backend server
A personal system at this scale (48 accounts) does not need a persistently-running server process.
Postgres RPC functions + a couple of Edge Functions cover every case where a trusted, secret-holding
component is required. This removes an entire category of ops work (patching, uptime, scaling) with
no loss of capability. See ADR-0002 for the secret-boundary details.

## Consequences
- Simpler ops: two managed platforms (Vercel + Supabase), no server to patch or scale.
- Android must be willing to make direct calls to platform APIs — this is explicitly required by
  the product spec anyway (traffic must originate from the phone's own network path).
- Edge Functions are the *only* place platform client secrets live. They must never be inlined into
  RPC functions that are reachable with the anon key without a secret check.

# ADR-0003: Android stack and background sync strategy

## Status
Accepted — 2026-08-25

## Decision
- Kotlin + Jetpack Compose, single-module-per-concern Gradle project (`app`, plus a `core` module
  for the platform-adapter interfaces shared with future code, kept minimal for now).
- **WorkManager** for all background sync (`CoroutineWorker` per sync job), not a foreground/forever
  service. Respects Doze/App Standby by design; we ask the user to exempt the app from battery
  optimization only as an optional troubleshooting step (§19), never require root or accessibility
  services.
- **Firebase Cloud Messaging** (data messages only, no notification payload) to wake the app
  promptly when the web dashboard creates a `sync_job`. Falls back to a periodic WorkManager poll
  (every 15–30 min while the app has been opened recently) if FCM delivery is delayed or the app is
  force-stopped — polling is the reliability backstop, FCM is the responsiveness optimization (§20).
- **EncryptedSharedPreferences** (Android Keystore-backed) for `device_uuid`/`device_secret` only.
  No refresh tokens are ever stored on-device (ADR-0002) — nothing else sensitive exists to store.
- **Room** is intentionally *not* included in the initial build — the app is a thin worker with no
  meaningful offline UI; local state is limited to device identity and last-sync timestamps in
  EncryptedSharedPreferences. Add Room later only if a real offline-queueing requirement appears
  (§43 offline behavior can be satisfied by WorkManager's own constraint-based retry queue).

## Consequences
- No custom foreground service to maintain; Android's own scheduler decides when work runs, which
  is the "respect background limitations" requirement (§19).
- FCM requires a Firebase project — flagged as a human setup step in ANDROID_SETUP.md, not a
  blocker for the rest of the build (polling fallback works without it).

# ADR-0008: Google/YouTube OAuth uses an HTTPS App Link redirect, not a custom scheme

## Status
Accepted — 2026-08-27

## Context
Every other platform (Instagram, TikTok, Facebook, Threads, X) redirects back to the app via a
custom URI scheme — `com.puresquare.socialinsight://oauth-callback` — matching ADR-0002's original
design. Testing the real YouTube connection flow surfaced `Error 400: invalid_request` / "doesn't
comply with Google's OAuth 2.0 policy for keeping apps secure." Google's own current documentation
(developers.google.com/identity/protocols/oauth2/native-app) confirms this isn't a configuration
mistake on our end: **"Custom URI schemes are no longer supported on Android and Chrome apps"** —
a platform-wide deprecation, not something fixable by adjusting request parameters.

## Decision
For Google only, redirect to an HTTPS URL that Android intercepts as a verified **App Link**
instead of loading it in the browser:

- Redirect URI: `https://web-jet-eight-66.vercel.app/oauth-callback`
- Digital Asset Links verification file: `web/public/.well-known/assetlinks.json` (served by the
  already-existing Vercel deployment — no new hosting stood up for this) — declares that
  `com.puresquare.socialinsight`, signed with our committed debug keystore's SHA-256 fingerprint,
  is authorized to handle links to that domain.
- `AndroidManifest.xml` gets a second intent-filter (`autoVerify="true"`, scheme `https`, host
  matching the Vercel domain, path prefix `/oauth-callback`) alongside the existing custom-scheme
  filter used by the other five platforms.
- `web/src/app/oauth-callback/page.tsx` is a plain fallback page — under normal conditions Android
  hands the navigation to the app before it ever loads, this only renders if verification hasn't
  propagated yet or the link is opened somewhere App Links don't apply (e.g. a desktop browser).
- The Google OAuth client itself changes from **Android type to Web application type** — Android
  clients validate identity via package+SHA1 and (per the finding above) no longer support any
  redirect-URI-based browser flow at all; Web application clients support registering an exact
  HTTPS redirect URI and, notably, always issue a `client_secret`. This is a net simplification for
  our architecture: `exchangeCodeForToken`'s YouTube config
  (`supabase/functions/_shared/platforms.ts`) already treated `YOUTUBE_CLIENT_SECRET` as optional
  specifically because Android-type clients are usually public/secret-less — a Web-type client now
  uses that same code path with a real secret, identically to every other platform, no code changes
  required on the Edge Function side.

## Consequences
- YouTube's OAuth flow is no longer symmetric with the other five platforms at the manifest/launcher
  level — `PlatformOAuthConfig`/`OAuthLauncher` need a per-platform redirect URI rather than one
  global constant, and `MainActivity`'s intent handling needs to recognize both the custom-scheme
  and the App-Link forms of an incoming redirect.
- App Link verification depends on the assetlinks.json file staying live at the Vercel domain and
  matching whatever signing key actually produced the installed APK. If the debug keystore
  (ADR/commit: "Pin a persistent debug signing key...") is ever regenerated, this file's
  `sha256_cert_fingerprints` must be updated to match, or the App Link stops verifying and Google
  redirects will fall through to the browser fallback page instead of reopening the app.
- If the Vercel deployment URL ever changes (e.g. a custom domain is added later), both the
  redirect URI registered in Google Cloud Console and the manifest's intent-filter host must be
  updated together.

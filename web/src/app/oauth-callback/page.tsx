// Fallback page for the Android App Link OAuth redirect (Google/YouTube only — see
// docs/decisions/0008-google-oauth-app-link-redirect.md). Under normal conditions Android
// intercepts navigation to this URL before it ever loads here, handing it straight to the app.
// This page only renders if that interception didn't happen (App Link verification hasn't
// propagated yet, a desktop browser, etc.) — it's a safety net, not the primary path.
export default function OAuthCallbackPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center">
      <div>
        <h1 className="mb-2 text-lg font-semibold text-neutral-100">Redirecting to Social Analytics…</h1>
        <p className="text-sm text-neutral-400">
          If the app didn&apos;t open automatically, return to it manually — this authorization can&apos;t
          be completed from a browser.
        </p>
      </div>
    </main>
  )
}

'use client'

import { useEffect, useState } from 'react'

// Fallback page for the Android App Link OAuth redirect (Google/YouTube only — see
// docs/decisions/0008-google-oauth-app-link-redirect.md). Under ideal conditions Android
// intercepts navigation to this URL before it ever loads here, handing it straight to the app via
// the verified App Link. In practice, Digital Asset Links auto-verification for a sideloaded
// (non-Play-Store) debug APK is not fully reliable — it can lag or silently fail on some devices.
// This page is the safety net for exactly that case: it forwards the same query string (code,
// state) to the app's custom-scheme redirect instead, which Android always honors immediately
// since custom schemes need no verification. Belt and suspenders: attempts an automatic redirect
// first, and always shows a manual button too, since some browsers only allow a custom-scheme
// navigation triggered by an actual tap, not a script running on page load.
export default function OAuthCallbackPage() {
  const [appUrl, setAppUrl] = useState<string | null>(null)

  useEffect(() => {
    const target = `com.puresquare.socialinsight://oauth-callback${window.location.search}`
    setAppUrl(target)
    window.location.href = target
  }, [])

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 text-center">
      <div>
        <h1 className="mb-2 text-lg font-semibold text-neutral-100">Redirecting to Social Analytics…</h1>
        <p className="mb-6 text-sm text-neutral-400">
          If the app didn&apos;t open automatically, tap below to continue.
        </p>
        {appUrl && (
          <a
            href={appUrl}
            className="inline-block rounded-md bg-neutral-100 px-4 py-2 font-medium text-neutral-900"
          >
            Open Social Analytics
          </a>
        )}
      </div>
    </main>
  )
}

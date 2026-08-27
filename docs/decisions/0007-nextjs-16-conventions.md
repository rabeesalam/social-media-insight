# ADR-0007: Next.js 16 conventions actually in use (verified against installed docs, not memory)

## Status
Accepted — 2026-08-25

## Context
`create-next-app` installed **Next.js 16.3.2** (React 19.2.8), which is newer than any Next.js
version reflected in the model's training data and ships with breaking changes. Per the project's
own generated `web/AGENTS.md` warning, the bundled docs at `web/node_modules/next/dist/docs/` were
read before writing any App Router code, rather than relying on remembered Next.js 13–15 behavior.

## Decisions

1. **`middleware.ts` is deprecated → use `proxy.ts`.** Confirmed directly in
   `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`: "The
   `middleware` file convention is deprecated and has been renamed to `proxy`." The file lives at
   `web/src/proxy.ts`, exports a function named (or defaulted) `proxy`, and the route-matching
   `config.matcher` export is unchanged. Session-refresh/route-protection logic itself lives in
   `web/src/lib/supabase/middleware.ts` (kept that filename since it's Supabase's own convention
   for this helper, just invoked from `proxy.ts` instead of a file literally named `middleware.ts`).

2. **Cache Components (`cacheComponents: true` in `next.config.ts`) is deliberately left
   disabled.** It is opt-in in 16.3.2, not the default — confirmed in
   `01-getting-started/08-caching.md`. Enabling it would require every Server Component that reads
   `cookies()`/`headers()` or fetches per-request Supabase data (i.e. nearly this entire dashboard)
   to be explicitly wrapped in `<Suspense>` or annotated `"use cache"`/`cacheLife(...)`, with
   incorrect usage caught only by a dev-overlay lint (`blocking-prerender-*` insights). For an
   internal analytics tool used by 1–3 people where **fresh data matters more than instant
   navigation performance**, this is complexity with no real payoff — a static shell optimized for
   anonymous, high-traffic public pages is the wrong target for a login-gated internal dashboard.
   We use the "previous model" (`02-guides/caching-without-cache-components.md`), which behaves
   like the App Router caching semantics already familiar from earlier Next.js versions: plain
   `async` Server Components, no forced Suspense boundaries, `revalidatePath`/`revalidateTag` for
   invalidation.

## Consequences
- Any future contributor (human or agent) modifying `web/` must re-check
  `node_modules/next/dist/docs/` against the *actually installed* Next.js version before assuming
  App Router behavior — this project intentionally tracks whatever `create-next-app` installs, not
  a pinned older version, so drift is expected and the bundled docs are the source of truth, not
  general Next.js familiarity.
- If a future requirement genuinely needs instant static-shell navigation (unlikely for this
  product), revisit Cache Components then — turning it on is a config flag, not a rewrite, but
  doing so now would front-load Suspense-wrapping work with no current benefit.

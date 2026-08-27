# Troubleshooting

Real issues hit while building this project on this machine, and how they were actually resolved
— not hypothetical. Update this file whenever a new one surfaces.

## `winget install` fails with exit code 1602 / "You cancelled the installation"

Hit installing both Node.js and Temurin JDK 17 via `winget` on this machine. The installer (MSI)
requires an interactive UAC elevation prompt; in a non-interactive automation session there's no
one to click "Yes", so Windows auto-cancels it after a timeout.

**Fix:** use a portable/zip distribution instead of the MSI installer — no admin rights needed.
- Node.js: the user installed it manually (a portable zip or the standard installer run
  interactively both work).
- JDK: downloaded the Temurin 17 **zip** (not MSI) directly from Adoptium's API
  (`https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse`),
  extracted to `C:\Users\<user>\dev-tools\jdk-17.x`, then set `JAVA_HOME` and appended `bin` to
  `PATH` via `[Environment]::SetEnvironmentVariable(..., "User")`.

Do **not** reach for Docker or a bundled/embedded-Postgres-style binary (e.g. the zonky Maven
artifact) to work around a similar admin-permission wall for local Postgres — see the next entry.

## No local Postgres / Docker — validate schema against the real Supabase project instead

This machine has no Docker (so `supabase start` doesn't work) and installing PostgreSQL directly
hits the same UAC-cancellation problem as above. Rather than hunting for another portable-binary
workaround, migrations are validated for real with:

```bash
supabase link --project-ref <ref>   # SUPABASE_ACCESS_TOKEN + SUPABASE_DB_PASSWORD as env vars
supabase db push
```

against the actual Supabase Cloud project. This already caught two real bugs during initial
development (see `supabase/migrations/0005_rls_policies.sql` and `0006_device_rpc_functions.sql`
git history / ADR-0002) that a purely manual read-through missed.

## PATH changes don't apply to the current shell session

Each `Bash`/`PowerShell` tool call may be a fresh process — `export PATH=...` in one call does not
persist to the next. Two independent fixes are layered:
1. `[Environment]::SetEnvironmentVariable("PATH", ..., "User")` persists it for *new* processes
   going forward (new terminal sessions, new tool calls in future conversations).
2. Within a single already-open session, prefix the specific command:
   `export PATH="$PATH:/c/Program Files/nodejs"` (bash) before `node`/`npm` calls.

## Next.js 16 breaking changes vs. training-data assumptions

This project's `create-next-app` installed Next.js 16.3.2, newer than any version reflected in
general model knowledge. The project's own generated `web/AGENTS.md` flags this and points at
`web/node_modules/next/dist/docs/` as the source of truth. Two concrete breaking changes that bit
us:
- `middleware.ts` is deprecated → renamed to `proxy.ts`, exported function named/defaulted
  `proxy`. See ADR-0007.
- "Cache Components" (PPR, `use cache`, forced `<Suspense>` boundaries around any `cookies()`/
  fetch access) is opt-in via `cacheComponents: true` in `next.config.ts` — left disabled
  deliberately (ADR-0007). If a future contributor turns it on, expect to need `<Suspense>` around
  every Supabase read in `app/dashboard/**`.

**Rule of thumb going forward:** before writing App Router code against whatever Next.js version
is actually installed, check `web/node_modules/next/dist/docs/` for that specific version rather
than assuming Next.js 13–15 conventions still apply.

## `preview_start`-launched dev servers have NO outbound internet access

Discovered while debugging why the login form always failed with "Invalid email or password" even
though the exact same credentials succeeded via a plain `node -e` script run through the `Bash`
tool. Root cause, isolated step by step:

1. A direct Node script (via `Bash` tool) calling `supabase.auth.signInWithPassword` with the
   admin credentials succeeded (`hasSession: true`).
2. The same call, made from inside the Next.js dev server process started via
   `mcp__Claude_Browser__preview_start`, failed with `fetch failed` / `status: 0`.
3. A temporary debug route (`fetch()` to Supabase, `google.com`, and `example.com`) confirmed the
   `preview_start`-launched process has **zero outbound internet access at all** — not a
   Supabase-specific problem.
4. Starting the exact same `next dev` process instead via the `Bash` tool with
   `dangerouslyDisableSandbox: true` fixed it immediately — the same debug route returned `200`
   for all three hosts.

**Conclusion:** `preview_start` runs the dev server in a network-sandboxed child process by
design, presumably to constrain what an agent-launched long-running server can reach. Any app that
needs to call a real external API from server-side code (this one calls Supabase from Server
Actions and Server Components) will falsely appear broken if only tested through `preview_start`.

**Working pattern used to actually verify the login flow end-to-end:**
```bash
cd web && set -a && source ../.env.local && set +a && nohup npm run dev > /tmp/dev.log 2>&1 &
```
run via the `Bash` tool with `dangerouslyDisableSandbox: true`, then drive the already-open
Browser pane tab with `mcp__Claude_Browser__navigate` against `http://localhost:3000` (the browser
tab itself doesn't need to have been opened by `preview_start` — `navigate` will hit any URL, and
`preview_stop` isn't required first, just make sure only one process is bound to the port).

This is a property of this development/testing environment, not of the deployed app — Vercel has
normal outbound internet access, so this only matters for local iteration inside this harness.

## Gradle/any Java build fails: "Unable to establish loopback connection" (Windows, this harness)

Hit trying to run `gradle wrapper` / any Gradle build for the Android app. Every attempt — with or
without the Gradle daemon, with `dangerouslyDisableSandbox: true`, with
`-Djava.net.preferIPv4Stack=true`, forcing `sun.nio.ch.WindowsSelectorProvider` — failed identically:

```
java.io.IOException: Unable to establish loopback connection
Caused by: java.net.SocketException: Invalid argument: connect
	at java.base/sun.nio.ch.UnixDomainSockets.connect0(Native Method)
	...WEPollSelectorImpl / WindowsSelectorImpl ... PipeImpl$Initializer$LoopbackConnector...
```

**Isolated the root cause** with a two-line standalone test (`java.nio.channels.Selector.open()`)
run directly, no Gradle involved — it fails the exact same way. So this has nothing to do with
Gradle, this project, or JDK configuration.

**This is a known, currently open bug in Claude Code itself on Windows:**
[anthropics/claude-code#41432](https://github.com/anthropics/claude-code/issues/41432) — Java's
newer NIO selector implementation on Windows (`WEPollSelectorImpl`) needs a loopback Unix-domain
socket for its internal wakeup pipe, and child processes launched by this harness run inside a
Windows sandboxing boundary (AppContainer-style loopback isolation) that blocks exactly that,
regardless of the Bash tool's own `dangerouslyDisableSandbox` flag — that flag controls a different,
outer sandbox layer, not this OS-level restriction. A related report
([PortSwigger/mcp-server#82](https://github.com/PortSwigger/mcp-server/issues/82)) describes the
identical symptom for any JVM launched as a subprocess of Claude Desktop/Code on Windows.

**Practical consequence:** no Java-based build (Gradle, Maven, plain `java`/`javac` programs that
touch NIO selectors) can be compiled or run from *inside this tool session* on this machine. This
is not fixable by changing project configuration, JDK flags, or firewall/antivirus settings from
here — it needs either an upstream fix to Claude Code, or the build to be run from a regular
terminal window the user opens themselves (outside this harness's process sandbox), where the same
`gradlew` command should work normally since it won't be sandboxed the same way.

**What this means for `android/`:** the Gradle project, manifest, and all Kotlin source were
written and manually reviewed for correctness, but — unlike `web/` and `supabase/`, both verified
by an actual successful build/push — the Android app's `./gradlew build` has **not** been run
successfully anywhere yet. Treat it as unverified until either (a) this Claude Code issue is fixed
and a build is retried here, or (b) the user runs `cd android && ./gradlew assembleDebug` in their
own terminal and reports back the result.

# ADR-0006: Network path — respect existing device proxy/VPN, no evasion logic

## Status
Accepted — 2026-08-25

## Decision
The Android app makes all platform API calls through Android's normal default network stack
(standard `OkHttp`/`HttpURLConnection` respecting the system's configured VPN/proxy, e.g. SocksDroid
already running on the phone). The app does not:
- read, configure, or programmatically toggle SocksDroid or any VPN/proxy,
- attempt to detect or evade platform anti-fraud/device-fingerprinting systems,
- spoof device identifiers, user-agent strings, or location,
- fall back to scraping if an official API call is rate-limited or denied.

A diagnostics screen reports **observed** network state using only legitimate OS-level signals
(`ConnectivityManager` for internet/VPN-active flags, a plain reachability check against the API
host, and — only if the user opts in on that screen — a neutral external IP-echo request labeled
"Observed public egress IP", never "confirmed platform-visible identity"). This satisfies §18: we
report what the OS tells us, we do not claim to guarantee what any platform infers.

## Consequences
- If a platform's official API rejects a request for anti-abuse reasons, the adapter surfaces that
  as a normal error category (`platform_denied`) — it is never treated as a bug to route around.
- Any request from the user (now or later) to add fingerprint spoofing, VPN auto-switching tied to
  account identity, or scraping fallbacks is out of scope for this build per the product spec's own
  explicit prohibition (§3) and will be declined.

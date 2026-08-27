# ADR-0004: Platform adapter pattern + capability-driven UI

## Status
Accepted — 2026-08-25

## Decision
Each platform (`instagram`, `tiktok`, `youtube`, `facebook`, `threads`, `x`) gets an isolated
adapter under `android/app/src/main/kotlin/.../platforms/<platform>/` implementing a shared
Kotlin interface:

```kotlin
interface PlatformAdapter {
    val platform: Platform
    fun buildAuthorizationRequest(): AuthorizationRequest        // PKCE challenge, scopes, authorize URL
    suspend fun getAccount(accessToken: String): PlatformAccount
    suspend fun listContent(accessToken: String, since: Instant?): List<RawContent>
    suspend fun getContentMetrics(accessToken: String, contentId: String): RawMetrics
    suspend fun getAccountMetrics(accessToken: String): RawMetrics
    suspend fun getAudienceMetrics(accessToken: String): RawMetrics?   // null = not supported, not zero
    fun normalizeContent(raw: RawContent): NormalizedContent
    fun normalizeMetrics(raw: RawMetrics): NormalizedMetrics          // unsupported fields => null, never 0
    suspend fun healthCheck(accessToken: String): HealthStatus
}
```

Every field in `NormalizedMetrics` is nullable. A `null` means "this platform/account/content did
not provide this metric" and must render in the UI as "Unavailable via API" — never as `0` (§8,
§34). A shared `capabilities: PlatformCapabilities` object per adapter (booleans/enums, generated
from `docs/platform-capability-matrix.md`) drives which UI elements the web dashboard even attempts
to show for that platform, rather than discovering "unsupported" only at request time.

## Consequences
- Adding a platform never touches another platform's code.
- The capability matrix (research, §10/§64) is not just documentation — it is the source of truth
  that both the adapter's `capabilities` object and the dashboard's per-platform UI are written
  against, so "supported/unsupported" stays consistent between backend and frontend by construction
  rather than by convention.

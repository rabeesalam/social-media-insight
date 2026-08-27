package com.puresquare.socialinsight.platforms

import com.puresquare.socialinsight.BuildConfig

/**
 * Per-platform authorization endpoint + scopes, sourced from docs/platform-capability-matrix.md
 * (verified against each platform's current official docs — see that file for source URLs and
 * verification dates, per the project's own rule against inventing endpoints).
 *
 * `usesPkce = false` does NOT mean "less secure" — Meta's OAuth (Instagram/Threads/Facebook)
 * doesn't support PKCE at all; its equivalent protection is that the authorization code is
 * single-use/short-lived and the token exchange (which needs client_secret) happens exclusively
 * server-side in the oauth-exchange Edge Function, never in this app. See ADR-0002.
 */
data class PlatformOAuthConfig(
    val platform: Platform,
    val authorizeUrl: String,
    val clientId: String,
    val scopes: List<String>,
    val usesPkce: Boolean,
    val extraParams: Map<String, String> = emptyMap(),
    val verified: Boolean,
    val verificationNote: String,
) {
    val isConfigured: Boolean get() = clientId.isNotBlank()
}

object PlatformOAuthRegistry {

    val configs: Map<Platform, PlatformOAuthConfig> = mapOf(
        Platform.INSTAGRAM to PlatformOAuthConfig(
            platform = Platform.INSTAGRAM,
            authorizeUrl = "https://www.instagram.com/oauth/authorize",
            clientId = BuildConfig.INSTAGRAM_CLIENT_ID,
            scopes = listOf("instagram_business_basic", "instagram_business_manage_insights"),
            usesPkce = false,
            verified = false,
            verificationNote = "Instagram-Login (non-Facebook-Page) flow — endpoint/scopes need a " +
                "final re-check against current Meta docs before first real use; see " +
                "docs/platform-capability-matrix.md.",
        ),
        Platform.TIKTOK to PlatformOAuthConfig(
            platform = Platform.TIKTOK,
            authorizeUrl = "https://www.tiktok.com/v2/auth/authorize/",
            clientId = BuildConfig.TIKTOK_CLIENT_KEY,
            scopes = listOf("user.info.basic", "user.info.profile", "user.info.stats", "video.list"),
            usesPkce = true,
            extraParams = mapOf(), // TikTok's client id param is "client_key", not "client_id" — see buildAuthorizationUrl
            verified = true,
            verificationNote = "Verified against developers.tiktok.com 2026-08-25 (see capability matrix).",
        ),
        Platform.YOUTUBE to PlatformOAuthConfig(
            platform = Platform.YOUTUBE,
            authorizeUrl = "https://accounts.google.com/o/oauth2/v2/auth",
            clientId = BuildConfig.YOUTUBE_CLIENT_ID,
            scopes = listOf(
                "https://www.googleapis.com/auth/youtube.readonly",
                "https://www.googleapis.com/auth/yt-analytics.readonly",
            ),
            usesPkce = true,
            // "prompt" accepts a space-separated list of values in ONE param: select_account
            // forces Google's account-chooser UI (critical for this app, since a phone will
            // often have multiple Google accounts signed in across avatars) — without it, Google
            // silently reuses whichever account already has an active session instead of asking.
            // consent forces the consent screen every time, which guarantees a refresh_token is
            // re-issued (Google only issues one on the *first* consent for a given account+app
            // otherwise).
            extraParams = mapOf("access_type" to "offline", "prompt" to "select_account consent"),
            verified = true,
            verificationNote = "Verified against developers.google.com/youtube 2026-08-25 (see capability matrix).",
        ),
        Platform.FACEBOOK to PlatformOAuthConfig(
            platform = Platform.FACEBOOK,
            authorizeUrl = "https://www.facebook.com/v23.0/dialog/oauth",
            clientId = BuildConfig.FACEBOOK_CLIENT_ID,
            scopes = listOf("pages_show_list", "pages_read_engagement", "pages_read_user_content", "read_insights"),
            usesPkce = false,
            verified = false,
            verificationNote = "Only works if the account is a real Facebook Page — confirmed there is NO " +
                "official API for professional-mode personal profiles. Resolve which account type you " +
                "actually have before enabling this (see docs/platform-capability-matrix.md).",
        ),
        Platform.THREADS to PlatformOAuthConfig(
            platform = Platform.THREADS,
            authorizeUrl = "https://threads.net/oauth/authorize",
            clientId = BuildConfig.THREADS_CLIENT_ID,
            scopes = listOf("threads_basic", "threads_manage_insights", "threads_read_replies"),
            usesPkce = false,
            verified = true,
            verificationNote = "Verified against developers.facebook.com/documentation/threads 2026-08-25.",
        ),
        Platform.X to PlatformOAuthConfig(
            platform = Platform.X,
            authorizeUrl = "https://x.com/i/oauth2/authorize",
            clientId = BuildConfig.X_CLIENT_ID,
            scopes = listOf("tweet.read", "users.read", "offline.access"),
            usesPkce = true,
            verified = true,
            verificationNote = "Verified against docs.x.com 2026-08-25 — requires a funded pay-per-use " +
                "billing account even for read-only access to your own posts (no free tier as of 2026).",
        ),
    )
}

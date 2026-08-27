package com.puresquare.socialinsight.oauth

import android.content.Context
import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import com.puresquare.socialinsight.platforms.PlatformOAuthConfig

const val OAUTH_REDIRECT_URI = "com.puresquare.socialinsight://oauth-callback"

/** One in-flight authorization attempt. Held in memory only (in a ViewModel — see
 * ConnectAccountsViewModel) — never persisted, since code_verifier is only useful for the few
 * seconds until the redirect comes back. */
data class PendingAuthorization(
    val platform: String,
    val avatarId: String,
    val state: String,
    val codeVerifier: String,
    val redirectUri: String,
)

/**
 * Opens the platform's own OAuth authorization page in a Chrome Custom Tab — a real, trusted
 * browser context, not a WebView this app controls. The platform's own login form and (if the
 * device has multiple accounts signed in) account-chooser UI is what the user sees and interacts
 * with; this app never touches the user's platform password. See §17 of the product spec and
 * ADR-0002.
 */
object OAuthLauncher {

    fun launch(context: Context, config: PlatformOAuthConfig, avatarId: String): PendingAuthorization {
        val state = Pkce.generateState()
        val codeVerifier = if (config.usesPkce) Pkce.generateCodeVerifier() else ""

        val uriBuilder = Uri.parse(config.authorizeUrl).buildUpon()
            .appendQueryParameter(if (config.platform.id == "tiktok") "client_key" else "client_id", config.clientId)
            .appendQueryParameter("redirect_uri", config.redirectUri)
            .appendQueryParameter("response_type", "code")
            .appendQueryParameter("scope", config.scopes.joinToString(if (config.platform.id == "tiktok") "," else " "))
            .appendQueryParameter("state", state)

        if (config.usesPkce) {
            uriBuilder
                .appendQueryParameter("code_challenge", Pkce.codeChallengeS256(codeVerifier))
                .appendQueryParameter("code_challenge_method", "S256")
        }
        config.extraParams.forEach { (key, value) -> uriBuilder.appendQueryParameter(key, value) }

        val customTabsIntent = CustomTabsIntent.Builder().build()
        customTabsIntent.launchUrl(context, uriBuilder.build())

        return PendingAuthorization(
            platform = config.platform.id,
            avatarId = avatarId,
            state = state,
            codeVerifier = codeVerifier,
            redirectUri = config.redirectUri,
        )
    }
}

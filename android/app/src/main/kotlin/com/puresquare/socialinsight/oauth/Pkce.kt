package com.puresquare.socialinsight.oauth

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

/** RFC 7636 PKCE. code_verifier never leaves this device except in the final token-exchange call
 * to our own oauth-exchange Edge Function (over HTTPS) — never sent to the platform itself except
 * as its S256 hash in the authorize request. */
object Pkce {
    private val secureRandom = SecureRandom()

    fun generateCodeVerifier(): String {
        val bytes = ByteArray(64)
        secureRandom.nextBytes(bytes)
        return base64UrlEncode(bytes)
    }

    fun codeChallengeS256(verifier: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray(Charsets.US_ASCII))
        return base64UrlEncode(digest)
    }

    fun generateState(): String {
        val bytes = ByteArray(24)
        secureRandom.nextBytes(bytes)
        return base64UrlEncode(bytes)
    }

    private fun base64UrlEncode(bytes: ByteArray): String =
        Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
}

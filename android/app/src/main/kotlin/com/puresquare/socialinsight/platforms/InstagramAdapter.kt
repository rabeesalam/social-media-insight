package com.puresquare.socialinsight.platforms

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Third platform adapter. Uses the Instagram API with Instagram Login (graph.instagram.com) —
 * confirmed against developers.facebook.com 2026-08-30 (see docs/platform-capability-matrix.md):
 * no linked Facebook Page required, works directly against an Instagram Business/Creator account.
 *
 * Auth is passed as an `access_token` query parameter (not an Authorization header) to match the
 * pattern already verified working in supabase/functions/_shared/platforms.ts's instagram config.
 *
 * Metric availability genuinely varies by `media_product_type` — requesting an unsupported metric
 * fails the entire insights call, so the metric list is chosen per type rather than requested
 * uniformly. STORY has no likes/comments/saved; only FEED/REELS get the full set. Never assume
 * parity with Facebook Page insights (see capability matrix).
 */
class InstagramAdapter {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun get(url: String): JSONObject {
        val request = Request.Builder().url(url).build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw PlatformApiException(response.code, "Instagram API error: $body")
            return JSONObject(body)
        }
    }

    /** Paginates `/me/media` via the Graph API's `paging.next` cursor URL until it hits a media
     * item already in [knownMediaIds] or runs out of pages — same stop-early strategy as the
     * other adapters. */
    fun listContent(accessToken: String, knownMediaIds: Set<String>, maxPages: Int = 20): List<RawContent> {
        val results = mutableListOf<RawContent>()
        var nextUrl: String? = "https://graph.instagram.com/me/media" +
            "?fields=id,media_type,media_product_type,media_url,permalink,thumbnail_url,caption,timestamp" +
            "&access_token=$accessToken"
        var page = 0

        while (nextUrl != null && page < maxPages) {
            page++
            val response = get(nextUrl)
            val items = response.optJSONArray("data") ?: break
            if (items.length() == 0) break

            var hitKnownMedia = false
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                val id = item.optString("id")

                if (id in knownMediaIds) {
                    hitKnownMedia = true
                    break
                }

                val mediaType = item.optString("media_type") // IMAGE | VIDEO | CAROUSEL_ALBUM
                results.add(
                    RawContent(
                        platformMediaId = id,
                        publicUrl = item.optString("permalink", "https://www.instagram.com/"),
                        // Instagram has no separate "title" — caption is the primary text, same
                        // fallback pattern as TikTok's description.
                        title = item.optString("caption", null),
                        thumbnailUrl = item.optString("thumbnail_url").ifBlank { item.optString("media_url", null) },
                        mediaType = if (mediaType == "VIDEO") "video" else "image",
                        publishedAt = item.optString("timestamp", null),
                    )
                )
            }

            if (hitKnownMedia) break
            nextUrl = response.optJSONObject("paging")?.optString("next")?.ifBlank { null }
        }

        return results
    }

    /** Metrics valid per `media_product_type`, per docs/platform-capability-matrix.md — requesting
     * an unsupported metric fails the whole insights call, so this must stay type-specific. */
    private fun metricsFor(mediaProductType: String): List<String> = when (mediaProductType) {
        "FEED", "REELS" -> listOf("views", "likes", "comments", "shares", "saved")
        "STORY" -> listOf("views", "shares")
        else -> emptyList() // e.g. "AD" — not organic content, never returned by /me/media anyway
    }

    fun getContentMetrics(accessToken: String, mediaId: String): RawMetrics {
        val mediaInfo = get("https://graph.instagram.com/$mediaId?fields=media_product_type&access_token=$accessToken")
        val mediaProductType = mediaInfo.optString("media_product_type")
        val metrics = metricsFor(mediaProductType)

        if (metrics.isEmpty()) {
            return RawMetrics(
                views = null, likes = null, comments = null, shares = null, saves = null,
                watchTimeSeconds = null, averageWatchTimeSeconds = null,
                rawResponseJson = mediaInfo.toString(),
            )
        }

        val response = get(
            "https://graph.instagram.com/$mediaId/insights?metric=${metrics.joinToString(",")}&access_token=$accessToken"
        )
        val data = response.optJSONArray("data") ?: JSONObject().optJSONArray("data")

        fun valueFor(metricName: String): Long? {
            if (data == null) return null
            for (i in 0 until data.length()) {
                val entry = data.optJSONObject(i) ?: continue
                if (entry.optString("name") == metricName) {
                    return entry.optJSONArray("values")?.optJSONObject(0)?.let {
                        if (it.has("value")) it.optLong("value") else null
                    }
                }
            }
            return null
        }

        return RawMetrics(
            views = valueFor("views"),
            likes = valueFor("likes"),
            comments = valueFor("comments"),
            shares = valueFor("shares"),
            saves = valueFor("saved"),
            watchTimeSeconds = null, // not exposed by this API
            averageWatchTimeSeconds = null,
            rawResponseJson = response.toString(),
        )
    }

    fun getAccountMetrics(accessToken: String): RawAccountMetrics {
        val response = get("https://graph.instagram.com/me?fields=followers_count,follows_count&access_token=$accessToken")

        return RawAccountMetrics(
            followers = if (response.has("followers_count")) response.optLong("followers_count") else null,
            following = if (response.has("follows_count")) response.optLong("follows_count") else null,
            rawResponseJson = response.toString(),
        )
    }
}

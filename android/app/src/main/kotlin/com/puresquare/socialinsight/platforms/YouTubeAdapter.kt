package com.puresquare.socialinsight.platforms

import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** One discovered video, before it's been written to platform_content. */
data class RawContent(
    val platformMediaId: String,
    val publicUrl: String,
    val title: String?,
    val thumbnailUrl: String?,
    val mediaType: String, // "video" | "short" — YouTube Data API doesn't cleanly flag Shorts; see note below
    val publishedAt: String?, // ISO-8601
)

/** Every field nullable — a platform simply not returning a metric must show as "Unavailable via
 * API" in the dashboard, never silently become 0. See ADR-0004. */
data class RawMetrics(
    val views: Long?,
    val likes: Long?,
    val comments: Long?,
    val shares: Long?,
    val saves: Long?,
    val watchTimeSeconds: Long?,
    val averageWatchTimeSeconds: Double?,
    val rawResponseJson: String,
)

/**
 * First platform adapter implemented end-to-end (Phase 6 of the build order — YouTube chosen
 * because its OAuth doesn't strictly require a client_secret for an Android/installed-app client,
 * simplifying the credential setup). Uses YouTube Data API v3 only for now; YouTube Analytics API
 * (watch time / audience retention / demographics) is a documented follow-up, not implemented yet
 * — see docs/platform-capability-matrix.md. Do not report watch-time numbers as 0; leave null.
 */
class YouTubeAdapter {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun get(url: String, accessToken: String): JSONObject {
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $accessToken")
            .build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                throw PlatformApiException(response.code, "YouTube API error: $body")
            }
            return JSONObject(body)
        }
    }

    /**
     * Lists the channel's uploads via the uploads playlist (1 quota unit per page) rather than
     * search.list (100 quota units) — see docs/platform-capability-matrix.md rate-limit notes.
     *
     * Paginates the playlist (newest-first) until either: (a) it hits a video already in
     * [knownMediaIds] — everything after that point is already on file, so stop; or (b) it runs
     * out of pages (full history reached — happens on a brand-new connection's first sync); or
     * (c) [maxPages] is hit, a safety cap so one pathological channel can't consume unbounded
     * quota in a single run. On an already-backfilled channel, ongoing syncs typically stop after
     * page 1 (nothing new), costing 1 quota unit — the full walk-back only happens once, on
     * first connection.
     */
    fun listContent(accessToken: String, knownMediaIds: Set<String>, maxPages: Int = 20): List<RawContent> {
        val channelResponse = get(
            "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true",
            accessToken,
        )
        val channelItems = channelResponse.optJSONArray("items")
        val uploadsPlaylistId = channelItems?.optJSONObject(0)
            ?.optJSONObject("contentDetails")
            ?.optJSONObject("relatedPlaylists")
            ?.optString("uploads")
            ?: throw PlatformApiException(404, "No YouTube channel found for this account")

        val results = mutableListOf<RawContent>()
        var pageToken: String? = null
        var page = 0

        while (page < maxPages) {
            page++
            val pageParam = pageToken?.let { "&pageToken=$it" } ?: ""
            val playlistResponse = get(
                "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=$uploadsPlaylistId&maxResults=50$pageParam",
                accessToken,
            )
            val items = playlistResponse.optJSONArray("items") ?: break

            var hitKnownVideo = false
            for (i in 0 until items.length()) {
                val item = items.getJSONObject(i)
                val snippet = item.optJSONObject("snippet")
                val videoId = item.optJSONObject("contentDetails")?.optString("videoId").orEmpty()

                if (videoId in knownMediaIds) {
                    hitKnownVideo = true
                    break
                }

                val thumbnails = snippet?.optJSONObject("thumbnails")
                val thumbnailUrl = (thumbnails?.optJSONObject("high") ?: thumbnails?.optJSONObject("default"))
                    ?.optString("url")

                results.add(
                    RawContent(
                        platformMediaId = videoId,
                        publicUrl = "https://www.youtube.com/watch?v=$videoId",
                        title = snippet?.optString("title"),
                        thumbnailUrl = thumbnailUrl,
                        mediaType = "video", // Shorts detection needs a separate videos.list(part=contentDetails) duration check — not done yet
                        publishedAt = snippet?.optString("publishedAt"),
                    )
                )
            }

            if (hitKnownVideo) break
            pageToken = playlistResponse.optString("nextPageToken", "").ifBlank { null } ?: break
        }

        return results
    }

    fun getContentMetrics(accessToken: String, videoId: String): RawMetrics {
        val response = get(
            "https://www.googleapis.com/youtube/v3/videos?part=statistics&id=$videoId",
            accessToken,
        )
        val stats = response.optJSONArray("items")?.optJSONObject(0)?.optJSONObject("statistics")
            ?: throw PlatformApiException(404, "Video not found or statistics unavailable: $videoId")

        fun longOrNull(key: String): Long? = if (stats.has(key)) stats.optLong(key) else null

        return RawMetrics(
            views = longOrNull("viewCount"),
            likes = longOrNull("likeCount"), // omitted entirely by the API if the uploader disabled public like counts
            comments = longOrNull("commentCount"),
            shares = null, // not exposed by Data API v3 statistics — genuinely unavailable, not "0"
            saves = null, // YouTube has no "saves" concept
            watchTimeSeconds = null, // requires YouTube Analytics API — not implemented yet
            averageWatchTimeSeconds = null,
            rawResponseJson = response.toString(),
        )
    }
}

class PlatformApiException(val httpCode: Int, message: String) : Exception(message)

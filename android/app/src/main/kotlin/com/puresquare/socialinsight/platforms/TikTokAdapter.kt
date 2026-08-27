package com.puresquare.socialinsight.platforms

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Second platform adapter (after YouTube). Built from the field/endpoint list confirmed in
 * docs/platform-capability-matrix.md (live-fetched from developers.tiktok.com 2026-08-25), but —
 * unlike YouTube's adapter — the exact request/response shapes below have NOT been exercised
 * against a real TikTok account yet. Treat the first real sync as the actual verification; if a
 * field name or response shape is off, this is the first place to check.
 */
class TikTokAdapter {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json".toMediaType()

    private fun get(url: String, accessToken: String): JSONObject {
        val request = Request.Builder().url(url).addHeader("Authorization", "Bearer $accessToken").build()
        client.newCall(request).execute().use { response ->
            val body = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw PlatformApiException(response.code, "TikTok API error: $body")
            return JSONObject(body)
        }
    }

    private fun post(url: String, accessToken: String, body: JSONObject): JSONObject {
        val request = Request.Builder()
            .url(url)
            .addHeader("Authorization", "Bearer $accessToken")
            .addHeader("Content-Type", "application/json")
            .post(body.toString().toRequestBody(jsonMedia))
            .build()
        client.newCall(request).execute().use { response ->
            val responseBody = response.body?.string().orEmpty()
            if (!response.isSuccessful) throw PlatformApiException(response.code, "TikTok API error: $responseBody")
            return JSONObject(responseBody)
        }
    }

    /** Paginates `/v2/video/list/` (cursor-based, newest first) until it hits a video already in
     * [knownMediaIds] or runs out of pages — same stop-early strategy as YouTubeAdapter. */
    fun listContent(accessToken: String, knownMediaIds: Set<String>, maxPages: Int = 20): List<RawContent> {
        val results = mutableListOf<RawContent>()
        var cursor = 0L
        var page = 0

        while (page < maxPages) {
            page++
            val body = JSONObject().apply {
                put("max_count", 20)
                if (cursor > 0) put("cursor", cursor)
            }
            val response = post(
                "https://open.tiktokapis.com/v2/video/list/?fields=id,create_time,cover_image_url,share_url,video_description,title",
                accessToken,
                body,
            )
            val data = response.optJSONObject("data") ?: break
            val videos = data.optJSONArray("videos") ?: break
            if (videos.length() == 0) break

            var hitKnownVideo = false
            for (i in 0 until videos.length()) {
                val v = videos.getJSONObject(i)
                val id = v.optString("id")

                if (id in knownMediaIds) {
                    hitKnownVideo = true
                    break
                }

                val createTimeEpochSeconds = if (v.has("create_time")) v.optLong("create_time") else null
                results.add(
                    RawContent(
                        platformMediaId = id,
                        publicUrl = v.optString("share_url", "https://www.tiktok.com/video/$id"),
                        // TikTok videos often have no separate "title" — description is the
                        // primary caption; fall back to it when title is blank, never fabricate one.
                        title = v.optString("title").ifBlank { v.optString("video_description", null) },
                        thumbnailUrl = v.optString("cover_image_url", null),
                        mediaType = "video",
                        publishedAt = createTimeEpochSeconds?.let { Instant.ofEpochSecond(it).toString() },
                    )
                )
            }

            if (hitKnownVideo) break
            if (!data.optBoolean("has_more", false)) break
            cursor = data.optLong("cursor", 0)
        }

        return results
    }

    fun getContentMetrics(accessToken: String, videoId: String): RawMetrics {
        val body = JSONObject().apply {
            put("filters", JSONObject().apply { put("video_ids", JSONArray(listOf(videoId))) })
        }
        val response = post(
            "https://open.tiktokapis.com/v2/video/query/?fields=id,like_count,comment_count,share_count,view_count",
            accessToken,
            body,
        )
        val video = response.optJSONObject("data")?.optJSONArray("videos")?.optJSONObject(0)
            ?: throw PlatformApiException(404, "Video not found or statistics unavailable: $videoId")

        fun longOrNull(key: String): Long? = if (video.has(key)) video.optLong(key) else null

        return RawMetrics(
            views = longOrNull("view_count"),
            likes = longOrNull("like_count"),
            comments = longOrNull("comment_count"),
            shares = longOrNull("share_count"),
            saves = null, // "favorite_count"/collects not confirmed available via Display API — see capability matrix
            watchTimeSeconds = null, // not exposed by Display API
            averageWatchTimeSeconds = null,
            rawResponseJson = response.toString(),
        )
    }

    fun getAccountMetrics(accessToken: String): RawAccountMetrics {
        val response = get(
            "https://open.tiktokapis.com/v2/user/info/?fields=follower_count,following_count",
            accessToken,
        )
        val user = response.optJSONObject("data")?.optJSONObject("user")
            ?: throw PlatformApiException(404, "No TikTok user found for this account")

        return RawAccountMetrics(
            followers = if (user.has("follower_count")) user.optLong("follower_count") else null,
            following = if (user.has("following_count")) user.optLong("following_count") else null,
            rawResponseJson = response.toString(),
        )
    }
}

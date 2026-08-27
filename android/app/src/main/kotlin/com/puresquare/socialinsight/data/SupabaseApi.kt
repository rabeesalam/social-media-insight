package com.puresquare.socialinsight.data

import com.puresquare.socialinsight.BuildConfig
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/** Thrown for any RPC failure — callers map `errorCode` to a user-facing message rather than
 * showing raw Postgres error text (§35: never show "Something went wrong" OR raw provider codes). */
class SupabaseRpcException(val errorCode: String?, message: String) : Exception(message)

/**
 * Thin PostgREST RPC client. The Android app only ever calls `SECURITY DEFINER` functions from
 * supabase/migrations/0006_device_rpc_functions.sql and 0008_device_read_rpc.sql — it never
 * selects tables directly, because it authenticates as `anon` + a per-device secret, not as a
 * Supabase Auth `authenticated` user (see docs/decisions/0002-secret-boundary-and-auth-model.md).
 */
class SupabaseApi(
    private val baseUrl: String = BuildConfig.SUPABASE_URL,
    private val anonKey: String = BuildConfig.SUPABASE_ANON_KEY,
) {
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private val json = Json { ignoreUnknownKeys = true }
    private val jsonMedia = "application/json".toMediaType()

    private fun rpc(function: String, params: JsonObject): JsonElement {
        if (baseUrl.isBlank() || anonKey.isBlank()) {
            throw SupabaseRpcException(
                "not_configured",
                "SUPABASE_URL / SUPABASE_ANON_KEY missing — set them in local.properties (see local.properties.example)."
            )
        }
        val request = Request.Builder()
            .url("$baseUrl/rest/v1/rpc/$function")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .addHeader("Content-Type", "application/json")
            .post(json.encodeToString(JsonObject.serializer(), params).toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            val bodyStr = response.body?.string().orEmpty()
            if (!response.isSuccessful) {
                val errorCode = runCatching {
                    json.parseToJsonElement(bodyStr).let { (it as? JsonObject)?.get("message") }
                }.getOrNull()?.toString()?.trim('"')
                throw SupabaseRpcException(errorCode, "RPC $function failed (${response.code}): $bodyStr")
            }
            return if (bodyStr.isBlank()) JsonObject(emptyMap()) else json.parseToJsonElement(bodyStr)
        }
    }

    // ---------------------------------------------------------------------
    // Device lifecycle
    // ---------------------------------------------------------------------

    @Serializable
    data class RegisterDeviceResult(val device_id: String, val device_secret: String)

    fun registerDevice(identity: DeviceIdentity): RegisterDeviceResult {
        val result = rpc(
            "register_device",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_name", identity.deviceName())
                put("p_app_version_name", BuildConfig.VERSION_NAME)
                put("p_app_version_code", BuildConfig.VERSION_CODE)
                put("p_android_version", identity.androidVersion())
                put("p_device_model", identity.deviceModel())
            }
        )
        // register_device returns `table(...)`, i.e. a JSON array with one row over PostgREST.
        val row = (result as kotlinx.serialization.json.JsonArray).first()
        return json.decodeFromJsonElement(RegisterDeviceResult.serializer(), row)
    }

    fun deviceHeartbeat(identity: DeviceIdentity, status: String = "online") {
        rpc(
            "device_heartbeat",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
                put("p_status", status)
                put("p_app_version_name", BuildConfig.VERSION_NAME)
                put("p_app_version_code", BuildConfig.VERSION_CODE)
            }
        )
    }

    // ---------------------------------------------------------------------
    // Avatars
    // ---------------------------------------------------------------------

    @Serializable
    data class Avatar(
        val id: String,
        val device_id: String,
        val name: String,
        val handle: String? = null,
        val profile_image_url: String? = null,
    )

    fun upsertAvatar(identity: DeviceIdentity, name: String, avatarId: String? = null): String {
        val result = rpc(
            "upsert_avatar",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
                put("p_avatar_id", avatarId)
                put("p_name", name)
                put("p_handle", null as String?)
                put("p_profile_image_url", null as String?)
            }
        )
        return result.toString().trim('"')
    }

    fun listAvatars(identity: DeviceIdentity): List<Avatar> {
        val result = rpc(
            "list_avatars_for_device",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
            }
        )
        return json.decodeFromJsonElement(
            kotlinx.serialization.builtins.ListSerializer(Avatar.serializer()),
            result
        )
    }

    // ---------------------------------------------------------------------
    // Platform connections
    // ---------------------------------------------------------------------

    @Serializable
    data class PlatformConnection(
        val id: String,
        val avatar_id: String,
        val device_id: String,
        val platform: String,
        val platform_account_id: String? = null,
        val username: String? = null,
        val display_name: String? = null,
        val status: String,
        val last_error: String? = null,
    )

    fun listPlatformConnections(identity: DeviceIdentity): List<PlatformConnection> {
        val result = rpc(
            "list_platform_connections_for_device",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
            }
        )
        return json.decodeFromJsonElement(
            kotlinx.serialization.builtins.ListSerializer(PlatformConnection.serializer()),
            result
        )
    }

    // ---------------------------------------------------------------------
    // OAuth exchange (Edge Function — see supabase/functions/oauth-exchange/)
    // ---------------------------------------------------------------------

    @Serializable
    data class OAuthExchangeResult(
        val status: String,
        val platform_username: String? = null,
        val connection_id: String? = null,
        val error: String? = null,
    )

    fun exchangeOAuthCode(
        identity: DeviceIdentity,
        avatarId: String,
        platform: String,
        code: String,
        codeVerifier: String,
        redirectUri: String,
    ): OAuthExchangeResult = callFunction(
        "oauth-exchange",
        buildJsonObject {
            put("device_uuid", identity.deviceUuid)
            put("device_secret", identity.requireSecret())
            put("avatar_id", avatarId)
            put("platform", platform)
            put("code", code)
            put("code_verifier", codeVerifier)
            put("redirect_uri", redirectUri)
        },
        OAuthExchangeResult.serializer(),
    )

    // ---------------------------------------------------------------------
    // Access tokens (Edge Function — see supabase/functions/get-access-token/)
    // ---------------------------------------------------------------------

    @Serializable
    data class AccessTokenResult(
        val status: String,
        val access_token: String? = null,
        val expires_at: String? = null,
        val error: String? = null,
    )

    /** Returned token lives in memory only for the duration of the caller's sync job — never
     * written to disk (ADR-0002). */
    fun getAccessToken(identity: DeviceIdentity, platformConnectionId: String): AccessTokenResult = callFunction(
        "get-access-token",
        buildJsonObject {
            put("device_uuid", identity.deviceUuid)
            put("device_secret", identity.requireSecret())
            put("platform_connection_id", platformConnectionId)
        },
        AccessTokenResult.serializer(),
    )

    private fun <T> callFunction(name: String, payload: JsonObject, serializer: kotlinx.serialization.KSerializer<T>): T {
        if (baseUrl.isBlank() || anonKey.isBlank()) {
            throw SupabaseRpcException("not_configured", "Supabase not configured.")
        }
        val request = Request.Builder()
            .url("$baseUrl/functions/v1/$name")
            .addHeader("apikey", anonKey)
            .addHeader("Authorization", "Bearer $anonKey")
            .addHeader("Content-Type", "application/json")
            .post(json.encodeToString(JsonObject.serializer(), payload).toRequestBody(jsonMedia))
            .build()

        client.newCall(request).execute().use { response ->
            val bodyStr = response.body?.string().orEmpty()
            return runCatching {
                json.decodeFromString(serializer, bodyStr)
            }.getOrElse {
                throw SupabaseRpcException("function_call_failed", "$name failed (${response.code}): $bodyStr")
            }
        }
    }

    // ---------------------------------------------------------------------
    // Sync jobs
    // ---------------------------------------------------------------------

    @Serializable
    data class SyncJob(
        val id: String,
        val device_id: String,
        val platform_connection_id: String? = null,
        val platform_content_id: String? = null,
        val type: String,
        val status: String,
    )

    fun claimNextSyncJob(identity: DeviceIdentity): SyncJob? {
        val result = rpc(
            "claim_next_sync_job",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
            }
        )
        if (result is kotlinx.serialization.json.JsonNull) return null
        return runCatching { json.decodeFromJsonElement(SyncJob.serializer(), result) }.getOrNull()
    }

    @Serializable
    data class ContentLookup(val platform_media_id: String, val platform: String, val platform_connection_id: String)

    fun getPlatformContentForDevice(identity: DeviceIdentity, platformContentId: String): ContentLookup? {
        val result = rpc(
            "get_platform_content_for_device",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
                put("p_platform_content_id", platformContentId)
            }
        )
        val row = (result as? kotlinx.serialization.json.JsonArray)?.firstOrNull() ?: return null
        return runCatching { json.decodeFromJsonElement(ContentLookup.serializer(), row) }.getOrNull()
    }

    fun startSyncJob(identity: DeviceIdentity, jobId: String) {
        rpc(
            "start_sync_job",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
                put("p_job_id", jobId)
            }
        )
    }

    fun completeSyncJob(
        identity: DeviceIdentity,
        jobId: String,
        status: String, // "completed" | "failed"
        errorMessage: String? = null,
        errorCategory: String? = null,
    ) {
        rpc(
            "complete_sync_job",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
                put("p_job_id", jobId)
                put("p_status", status)
                put("p_result_summary", null as String?)
                put("p_error_message", errorMessage)
                put("p_error_category", errorCategory)
            }
        )
    }

    // ---------------------------------------------------------------------
    // Content + metrics write path (called after a successful platform API fetch)
    // ---------------------------------------------------------------------

    fun upsertPlatformContent(
        identity: DeviceIdentity,
        platformConnectionId: String,
        platform: String,
        platformMediaId: String,
        publicUrl: String?,
        title: String?,
        caption: String?,
        thumbnailUrl: String?,
        mediaType: String,
        publishedAt: String?,
    ): String {
        val result = rpc(
            "upsert_platform_content",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
                put("p_platform_connection_id", platformConnectionId)
                put("p_platform", platform)
                put("p_platform_media_id", platformMediaId)
                put("p_public_url", publicUrl)
                put("p_title", title)
                put("p_caption", caption)
                put("p_thumbnail_url", thumbnailUrl)
                put("p_media_type", mediaType)
                put("p_published_at", publishedAt)
            }
        )
        return result.toString().trim('"')
    }

    fun insertMetricSnapshot(
        identity: DeviceIdentity,
        platformContentId: String,
        views: Long?,
        likes: Long?,
        comments: Long?,
        shares: Long?,
        saves: Long?,
        watchTimeSeconds: Long?,
        averageWatchTimeSeconds: Double?,
        engagementRate: Double?,
        rawResponseJson: String?,
        metricStatus: String = "ok",
    ) {
        rpc(
            "insert_metric_snapshot",
            buildJsonObject {
                put("p_device_uuid", identity.deviceUuid)
                put("p_device_secret", identity.requireSecret())
                put("p_platform_content_id", platformContentId)
                put("p_views", views)
                put("p_likes", likes)
                put("p_comments", comments)
                put("p_shares", shares)
                put("p_saves", saves)
                put("p_watch_time_seconds", watchTimeSeconds)
                put("p_average_watch_time_seconds", averageWatchTimeSeconds)
                put("p_engagement_rate", engagementRate)
                put(
                    "p_raw_response",
                    rawResponseJson?.let { runCatching { json.parseToJsonElement(it) }.getOrNull() }
                        ?: kotlinx.serialization.json.JsonNull
                )
                put("p_metric_status", metricStatus)
            }
        )
    }
}

/** Runs [block] and converts any failure into a plain user-facing message — never shows raw
 * exception text in the UI (§35 of the product spec: categorized errors, not stack traces). */
inline fun <T> rpcCall(block: () -> T): Result<T> = try {
    Result.success(block())
} catch (e: SupabaseRpcException) {
    Result.failure(e)
} catch (e: IOException) {
    Result.failure(SupabaseRpcException("network_error", "Network error — check connectivity."))
}

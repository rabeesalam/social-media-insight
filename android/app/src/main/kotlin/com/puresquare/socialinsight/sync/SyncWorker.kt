package com.puresquare.socialinsight.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.Constraints
import androidx.work.NetworkType
import com.puresquare.socialinsight.data.DeviceIdentity
import com.puresquare.socialinsight.data.SupabaseApi
import com.puresquare.socialinsight.data.rpcCall
import com.puresquare.socialinsight.platforms.PlatformApiException
import com.puresquare.socialinsight.platforms.YouTubeAdapter
import java.util.concurrent.TimeUnit

/**
 * Two jobs per run:
 *  1. Discovery — for every connected platform_connection with an implemented adapter, fetch the
 *     account's recent content and upsert metadata (title/URL/thumbnail). Cheap, idempotent, does
 *     NOT fetch metrics — that's the scheduler's job (respects the §31 age-tiered cadence).
 *  2. Queue processing — repeatedly claim_next_sync_job() until the queue (for this device) is
 *     empty, fetch metrics for whichever content the scheduler decided is due, write a snapshot.
 *
 * Registered as 15-minute periodic work — WorkManager's minimum periodic interval happens to match
 * the finest §31 tier exactly, so this alone is enough to service every tier; the scheduler
 * decides per-content whether a given run actually has anything due for it.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    private val identity = DeviceIdentity(applicationContext)
    private val api = SupabaseApi()
    private val youTube = YouTubeAdapter()

    override suspend fun doWork(): Result {
        if (!identity.isRegistered) return Result.success() // nothing to do before first registration

        rpcCall { api.deviceHeartbeat(identity) }

        runCatching { discoverNewContent() }
        runCatching { processQueue() }

        return Result.success()
    }

    private fun discoverNewContent() {
        val connections = rpcCall { api.listPlatformConnections(identity) }.getOrNull() ?: return

        for (connection in connections.filter { it.status == "connected" && it.platform == "youtube" }) {
            val tokenResult = rpcCall { api.getAccessToken(identity, connection.id) }.getOrNull() ?: continue
            val accessToken = tokenResult.access_token ?: continue

            val content = runCatching { youTube.listContent(accessToken) }.getOrNull() ?: continue
            for (item in content) {
                rpcCall {
                    api.upsertPlatformContent(
                        identity = identity,
                        platformConnectionId = connection.id,
                        platform = "youtube",
                        platformMediaId = item.platformMediaId,
                        publicUrl = item.publicUrl,
                        title = item.title,
                        caption = null,
                        thumbnailUrl = item.thumbnailUrl,
                        mediaType = item.mediaType,
                        publishedAt = item.publishedAt,
                    )
                }
            }
        }
    }

    private fun processQueue() {
        // Bounded loop, not `while (true)` — a single 15-minute run should not be able to spin
        // forever if something is subtly wrong with job claiming; 200 covers any realistic
        // personal-scale backlog (≤48 accounts) with room to spare.
        repeat(200) {
            val job = rpcCall { api.claimNextSyncJob(identity) }.getOrNull() ?: return
            processJob(job)
        }
    }

    private fun processJob(job: SupabaseApi.SyncJob) {
        rpcCall { api.startSyncJob(identity, job.id) }

        val contentId = job.platform_content_id
        if (job.type != "content_sync" || contentId == null) {
            rpcCall { api.completeSyncJob(identity, job.id, "failed", "Unsupported job type", "not_implemented") }
            return
        }

        val lookup = rpcCall { api.getPlatformContentForDevice(identity, contentId) }.getOrNull()
        if (lookup == null) {
            rpcCall { api.completeSyncJob(identity, job.id, "failed", "Content not found", "not_found") }
            return
        }

        if (lookup.platform != "youtube") {
            // Honest, not silent: this platform's adapter simply doesn't exist yet.
            rpcCall {
                api.completeSyncJob(
                    identity, job.id, "failed",
                    "No adapter implemented yet for ${lookup.platform}",
                    "not_implemented",
                )
            }
            return
        }

        val tokenResult = rpcCall { api.getAccessToken(identity, lookup.platform_connection_id) }.getOrNull()
        val accessToken = tokenResult?.access_token
        if (accessToken == null) {
            rpcCall { api.completeSyncJob(identity, job.id, "failed", tokenResult?.error ?: "Could not get access token", "auth_error") }
            return
        }

        try {
            val metrics = youTube.getContentMetrics(accessToken, lookup.platform_media_id)
            rpcCall {
                api.insertMetricSnapshot(
                    identity = identity,
                    platformContentId = contentId,
                    views = metrics.views,
                    likes = metrics.likes,
                    comments = metrics.comments,
                    shares = metrics.shares,
                    saves = metrics.saves,
                    watchTimeSeconds = metrics.watchTimeSeconds,
                    averageWatchTimeSeconds = metrics.averageWatchTimeSeconds,
                    engagementRate = null,
                    rawResponseJson = metrics.rawResponseJson,
                )
            }
            rpcCall { api.completeSyncJob(identity, job.id, "completed") }
        } catch (e: PlatformApiException) {
            val category = when (e.httpCode) {
                401, 403 -> "auth_error"
                404 -> "not_found"
                429 -> "rate_limited"
                in 500..599 -> "platform_error"
                else -> "unknown"
            }
            rpcCall { api.completeSyncJob(identity, job.id, "failed", e.message, category) }
        }
    }

    companion object {
        private const val WORK_NAME = "periodic-sync"

        fun schedule(context: Context) {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(constraints)
                .build()

            WorkManager.getInstance(context)
                .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
        }
    }
}

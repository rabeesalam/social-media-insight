-- 0016_app_triggerable_enqueue.sql
-- Real bug found via live testing: a device's sync run discovers new content (title/thumbnail
-- populate immediately) but its first metric_snapshot doesn't exist until enqueue_due_sync_jobs()
-- next runs on pg_cron's own 15-minute clock, is claimed, and processed — up to two sync passes
-- and 15+ minutes after a platform is first connected, metrics legitimately read as empty. Letting
-- the app call the same enqueue function itself right after discovery (in addition to pg_cron's
-- own schedule, which still covers periodic re-sync) closes that gap: newly discovered content
-- gets a job in the very same sync pass that found it.
--
-- Safe to expose directly: enqueue_due_sync_jobs() only inserts sync_jobs rows for content that's
-- actually due (per sync_interval_for_age, 0009) and already skips content with a pending/claimed/
-- running job, so calling it early or from multiple devices concurrently is a no-op beyond the
-- first real insert — nothing device-specific to leak, nothing to abuse by calling it often.

grant execute on function enqueue_due_sync_jobs() to anon, authenticated;

-- 0009_sync_scheduler.sql
-- Adaptive sync scheduling (§31 of the product spec, confirmed tiers):
--   content <24h old  -> resync every 15 minutes
--   content 1-7d old  -> resync hourly
--   content >7d old   -> resync every 6 hours
--   content never synced (no metric_snapshots yet) -> due immediately
--
-- pg_cron runs enqueue_due_sync_jobs() every 15 minutes (the finest tier); the function itself
-- decides per-content whether enough time has actually passed for its tier. Jobs still have to be
-- *claimed* by the owning device (claim_next_sync_job, 0006) — this only decides what's due.

create extension if not exists pg_cron;

-- content_sync jobs target one specific piece of content (unlike account_sync/platform_sync,
-- which target a whole connection) — a real column, not an overload of result_summary (which is
-- reserved for the job's outcome once it completes).
alter table sync_jobs add column platform_content_id uuid references platform_content(id) on delete cascade;
create index idx_sync_jobs_platform_content_id on sync_jobs(platform_content_id);

create function sync_interval_for_age(p_published_at timestamptz)
returns interval
language sql
immutable
as $$
  select case
    when p_published_at is null then interval '15 minutes'  -- unknown publish time: treat as new
    when now() - p_published_at < interval '24 hours' then interval '15 minutes'
    when now() - p_published_at < interval '7 days' then interval '1 hour'
    else interval '6 hours'
  end;
$$;

create function enqueue_due_sync_jobs()
returns integer
language plpgsql
as $$
declare
  v_enqueued integer;
begin
  with due_content as (
    select
      pc.id as platform_content_id,
      pc.platform_connection_id,
      conn.device_id,
      case
        when now() - pc.published_at < interval '24 hours' then 10  -- highest priority = lowest number
        when now() - pc.published_at < interval '7 days' then 50
        else 100
      end as priority
    from platform_content pc
    join platform_connections conn on conn.id = pc.platform_connection_id
    left join latest_metric_snapshots lms on lms.platform_content_id = pc.id
    where conn.status = 'connected'
      and (
        lms.captured_at is null
        or now() - lms.captured_at >= sync_interval_for_age(pc.published_at)
      )
      -- don't pile up duplicate pending/claimed/running jobs for the same content
      and not exists (
        select 1 from sync_jobs sj
        where sj.platform_content_id = pc.id
          and sj.type = 'content_sync'
          and sj.status in ('pending', 'claimed', 'running')
      )
  )
  insert into sync_jobs (device_id, platform_connection_id, platform_content_id, type, status, priority)
  select device_id, platform_connection_id, platform_content_id, 'content_sync', 'pending', priority
  from due_content;

  get diagnostics v_enqueued = row_count;
  return v_enqueued;
end;
$$;

select cron.schedule(
  'enqueue-due-sync-jobs',
  '*/15 * * * *',
  $$select enqueue_due_sync_jobs();$$
);

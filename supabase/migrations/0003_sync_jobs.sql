-- 0003_sync_jobs.sql
-- Job queue for both local (on-device) and remote (web-triggered) sync requests. §6/§21/§31.

create type sync_job_status as enum ('pending', 'claimed', 'running', 'completed', 'failed', 'cancelled');
create type sync_job_type as enum ('full_sync', 'account_sync', 'platform_sync', 'content_sync', 'analytics_sync');

create table sync_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  platform_connection_id uuid references platform_connections(id) on delete cascade,
  requested_by uuid references profiles(id),
  type sync_job_type not null,
  status sync_job_status not null default 'pending',
  priority integer not null default 100, -- lower = higher priority
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  error_category text,
  retry_count integer not null default 0,
  max_retries integer not null default 3,
  result_summary jsonb
);

comment on column sync_jobs.priority is
  'Lower value = claimed first. Content <24h old should be enqueued with a lower number than older content (§31).';

-- A device should never see another device's jobs, and a completed/cancelled job must never be
-- reprocessed even if claimed twice (idempotency, §21).

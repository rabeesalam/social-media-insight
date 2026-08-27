-- 0004_indexes.sql — §53. Composite indexes for the two hot query shapes:
-- "latest snapshot per content" and "pending jobs for device".

create index idx_avatars_device_id on avatars(device_id);
create index idx_platform_connections_avatar_id on platform_connections(avatar_id);
create index idx_platform_connections_device_id on platform_connections(device_id);
create index idx_platform_connections_status on platform_connections(status);

create index idx_content_items_avatar_id on content_items(avatar_id);
create index idx_platform_content_content_item_id on platform_content(content_item_id);
create index idx_platform_content_platform_connection_id on platform_content(platform_connection_id);
create index idx_platform_content_platform_media_id on platform_content(platform_media_id);

-- "latest snapshot per content": captured_at DESC per platform_content_id
create index idx_metric_snapshots_content_captured
  on metric_snapshots(platform_content_id, captured_at desc);
create index idx_metric_snapshots_captured_at on metric_snapshots(captured_at);

create index idx_audience_snapshots_connection_captured
  on audience_metric_snapshots(platform_connection_id, captured_at desc);
create index idx_audience_snapshots_content_id on audience_metric_snapshots(platform_content_id);

-- "pending jobs for device": status + device_id + priority ordering
create index idx_sync_jobs_pending_for_device
  on sync_jobs(device_id, status, priority, created_at)
  where status in ('pending', 'claimed', 'running');
create index idx_sync_jobs_platform_connection_id on sync_jobs(platform_connection_id);
create index idx_sync_jobs_created_at on sync_jobs(created_at);

create index idx_devices_device_uuid on devices(device_uuid);
create index idx_devices_status on devices(status);

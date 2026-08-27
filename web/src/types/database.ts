// Hand-written types mirroring supabase/migrations/*.sql. Keep in sync manually for now — once
// the schema stabilizes, generate with `supabase gen types typescript --linked` instead.

export type AppRole = 'admin' | 'viewer'
export type DeviceStatus = 'online' | 'offline' | 'syncing' | 'error' | 'disabled'
export type PlatformName = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'threads' | 'x'
export type ConnectionStatus = 'connected' | 'reauthorization_required' | 'error' | 'disabled' | 'pending'
export type MediaType = 'video' | 'reel' | 'short' | 'image' | 'carousel' | 'post' | 'story' | 'unknown'
export type SyncJobStatus = 'pending' | 'claimed' | 'running' | 'completed' | 'failed' | 'cancelled'
export type SyncJobType = 'full_sync' | 'account_sync' | 'platform_sync' | 'content_sync' | 'analytics_sync'

export interface Profile {
  id: string
  email: string
  role: AppRole
  created_at: string
  updated_at: string
}

export interface Device {
  id: string
  device_uuid: string
  device_name: string
  status: DeviceStatus
  app_version_name: string | null
  app_version_code: number | null
  android_version: string | null
  device_model: string | null
  last_seen_at: string | null
  last_sync_at: string | null
  created_at: string
  updated_at: string
}

export interface Avatar {
  id: string
  device_id: string
  name: string
  handle: string | null
  profile_image_url: string | null
  created_at: string
  updated_at: string
}

// Matches the platform_connections_safe view — token columns are never exposed here.
export interface PlatformConnectionSafe {
  id: string
  avatar_id: string
  device_id: string
  platform: PlatformName
  platform_account_id: string | null
  username: string | null
  display_name: string | null
  token_expires_at: string | null
  scopes: string[]
  status: ConnectionStatus
  last_sync_at: string | null
  last_error: string | null
  last_error_category: string | null
  created_at: string
  updated_at: string
}

export interface ContentItem {
  id: string
  avatar_id: string
  title: string | null
  content_group: string | null
  first_published_at: string | null
  created_at: string
  updated_at: string
}

export interface PlatformContent {
  id: string
  content_item_id: string | null
  platform_connection_id: string
  platform: PlatformName
  platform_media_id: string
  public_url: string | null
  title: string | null
  caption: string | null
  thumbnail_url: string | null
  media_type: MediaType
  published_at: string | null
  created_at: string
  updated_at: string
}

// Every numeric field is nullable by design — null means "not provided by this platform",
// never coerced to 0. See docs/decisions/0004-platform-adapter-pattern.md.
export interface MetricSnapshot {
  id: string
  platform_content_id: string
  captured_at: string
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  watch_time_seconds: number | null
  average_watch_time_seconds: number | null
  engagement_rate: number | null
  metric_source: string
  metric_status: 'ok' | 'partial' | 'unavailable' | 'error'
}

export interface SyncJob {
  id: string
  device_id: string
  platform_connection_id: string | null
  requested_by: string | null
  type: SyncJobType
  status: SyncJobStatus
  priority: number
  created_at: string
  claimed_at: string | null
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  error_category: string | null
  retry_count: number
  max_retries: number
  result_summary: Record<string, unknown> | null
}

// Minimal Supabase Database generic — enough for createClient<Database>() typing without
// hand-maintaining the full PostgREST schema shape.
export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> }
      devices: { Row: Device; Insert: Partial<Device>; Update: Partial<Device> }
      avatars: { Row: Avatar; Insert: Partial<Avatar>; Update: Partial<Avatar> }
      content_items: { Row: ContentItem; Insert: Partial<ContentItem>; Update: Partial<ContentItem> }
      platform_content: { Row: PlatformContent; Insert: Partial<PlatformContent>; Update: Partial<PlatformContent> }
      metric_snapshots: { Row: MetricSnapshot; Insert: Partial<MetricSnapshot>; Update: Partial<MetricSnapshot> }
      sync_jobs: { Row: SyncJob; Insert: Partial<SyncJob>; Update: Partial<SyncJob> }
    }
    Views: {
      platform_connections_safe: { Row: PlatformConnectionSafe }
      latest_metric_snapshots: { Row: MetricSnapshot }
    }
  }
}

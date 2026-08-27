-- 0002_content_and_metrics.sql
-- content_items (logical cross-platform grouping), platform_content (one row per platform post/video),
-- metric_snapshots + audience_metric_snapshots (append-only history), metric_metadata (comparability).
-- See docs/decisions/0005-metric-normalization.md.

create table content_items (
  id uuid primary key default gen_random_uuid(),
  avatar_id uuid not null references avatars(id) on delete cascade,
  title text,
  content_group text,
  first_published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create type media_type as enum ('video', 'reel', 'short', 'image', 'carousel', 'post', 'story', 'unknown');

create table platform_content (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid references content_items(id) on delete set null,
  platform_connection_id uuid not null references platform_connections(id) on delete cascade,
  platform platform_name not null,
  platform_media_id text not null,
  public_url text,
  title text,
  caption text,
  thumbnail_url text,
  media_type media_type not null default 'unknown',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_content_unique unique (platform, platform_media_id)
);

create trigger content_items_set_updated_at before update on content_items
  for each row execute function set_updated_at();
create trigger platform_content_set_updated_at before update on platform_content
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- metric_snapshots — append-only. Never UPDATE a historical row.
-- Every numeric column is nullable: null = "not provided by this platform/content",
-- never coerced to 0. See ADR-0004.
-- ---------------------------------------------------------------------------
create table metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform_content_id uuid not null references platform_content(id) on delete cascade,
  captured_at timestamptz not null default now(),
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  saves bigint,
  watch_time_seconds bigint,
  average_watch_time_seconds numeric,
  engagement_rate numeric,
  raw_response jsonb,
  metric_source text not null default 'api',
  metric_status text not null default 'ok' -- ok | partial | unavailable | error
);

-- ---------------------------------------------------------------------------
-- audience_metric_snapshots — flexible dimension/value model. Not every platform
-- exposes the same breakdowns (country vs age vs gender vs segment), so this is
-- intentionally not a fixed wide table (§23 of the product spec).
-- ---------------------------------------------------------------------------
create table audience_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform_connection_id uuid not null references platform_connections(id) on delete cascade,
  platform_content_id uuid references platform_content(id) on delete cascade,
  captured_at timestamptz not null default now(),
  dimension text not null,          -- 'country' | 'age' | 'gender' | 'segment' | ...
  dimension_value text not null,    -- 'US' | '25-34' | 'female' | ...
  metric_name text not null,        -- 'followers' | 'views' | 'percentage' | ...
  metric_value numeric,
  date_range_start date,
  date_range_end date,
  raw_response jsonb
);

-- ---------------------------------------------------------------------------
-- metric_metadata — cross-platform comparability rules (§55). Seeded per-platform
-- as adapters are implemented; the dashboard's combined-analytics view joins on
-- this table and refuses to sum metrics whose semantic_type differs.
-- ---------------------------------------------------------------------------
create table metric_metadata (
  id uuid primary key default gen_random_uuid(),
  platform platform_name not null,
  metric_name text not null,
  display_name text not null,
  semantic_type text not null,      -- e.g. 'video_views', 'reach', 'impressions', 'engagement_count'
  unit text not null default 'count',
  aggregation_allowed boolean not null default false,
  supported boolean not null default true,
  notes text,
  constraint metric_metadata_unique unique (platform, metric_name)
);

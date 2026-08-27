# ADR-0005: Append-only snapshots + metric metadata for cross-platform comparability

## Status
Accepted — 2026-08-25

## Decision
- `metric_snapshots` and `audience_metric_snapshots` are strictly append-only (INSERT-only RPC
  functions; no UPDATE grants for device role). Historical trend charts depend on this.
- A `metric_metadata` table maps every `(platform, metric_name)` pair to a `semantic_type` (e.g.
  `video_views`, `reach`, `impressions`, `engagement_count`) and an `aggregation_allowed` boolean.
  The dashboard's "Combined Analytics" view sums/compares metrics only within the same
  `semantic_type`, and always labels totals with the semantic type's display name (e.g. "Total
  video views") rather than a generic "Total Views" (§29/§55).
- Raw platform API responses are stored as `JSONB` alongside the normalized row so a metric we
  don't visualize today is not lost (§7), but raw payloads are scrubbed of anything resembling an
  auth header/secret before insert (defense in depth on top of the fact that adapters should never
  receive secrets to put in a response body in the first place).

## Consequences
- New metrics a platform adds later can be back-filled from `raw_response` without re-fetching.
- Cross-platform totals cannot silently mix incompatible metrics (e.g. Instagram reach vs YouTube
  views), directly satisfying §29's "do not aggregate semantically different metrics" rule.

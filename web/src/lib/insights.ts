import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlatformName } from '@/types/database'

export type Period = 'weekly' | 'monthly' | 'all'

export const PERIOD_LABEL: Record<Period, string> = {
  weekly: 'Weekly (last 7 days)',
  monthly: 'Monthly (last 30 days)',
  all: 'All-time',
}

export interface MetricTotals {
  videoCount: number
  views: number
  likes: number
  comments: number
  shares: number
  saves: number
  /** Weighted: sum(likes+comments+shares+saves) / sum(views) * 100 — NOT an average of
   * per-video rates, which would overweight low-view videos. Null when there are zero views to
   * divide by (an undefined rate, not a zero rate). */
  engagementRate: number | null
}

export interface PlatformTotals extends MetricTotals {
  platform: PlatformName
}

export interface AvatarInsights {
  avatarId: string
  avatarName: string
  followers: { platform: PlatformName; followers: number | null; capturedAt: string | null }[]
  perPlatform: PlatformTotals[]
  /** Combined across every connected platform. Views in particular are not perfectly
   * apples-to-apples across platforms (a YouTube "view" and an Instagram "reach" are counted
   * differently) — shown anyway because it was explicitly requested as a ballpark cross-platform
   * total, with the per-platform breakdown alongside it for the exact numbers. */
  combined: MetricTotals
}

function emptyTotals(): MetricTotals {
  return { videoCount: 0, views: 0, likes: 0, comments: 0, shares: 0, saves: 0, engagementRate: null }
}

function addInto(totals: MetricTotals, row: { views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }) {
  totals.videoCount += 1
  totals.views += row.views ?? 0
  totals.likes += row.likes ?? 0
  totals.comments += row.comments ?? 0
  totals.shares += row.shares ?? 0
  totals.saves += row.saves ?? 0
}

function finalizeEngagementRate(totals: MetricTotals) {
  const engaged = totals.likes + totals.comments + totals.shares + totals.saves
  totals.engagementRate = totals.views > 0 ? (engaged / totals.views) * 100 : null
}

interface SnapshotRow {
  platform_content_id: string
  captured_at: string
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  platform_content: { platform: PlatformName; platform_connection_id: string } | null
}

interface AccountSnapshotRow {
  platform_connection_id: string
  captured_at: string
  followers: number | null
}

export async function getInsights(supabase: SupabaseClient, period: Period): Promise<AvatarInsights[]> {
  const [{ data: avatars }, { data: connections }] = await Promise.all([
    supabase.from('avatars').select('id, name').order('name'),
    supabase.from('platform_connections_safe').select('id, avatar_id, platform, status'),
  ])

  const connectionById = new Map((connections ?? []).map((c) => [c.id, c]))

  let snapshotsQuery = supabase
    .from('metric_snapshots')
    .select('platform_content_id, captured_at, views, likes, comments, shares, saves, platform_content!inner(platform, platform_connection_id)')

  if (period === 'weekly') {
    snapshotsQuery = snapshotsQuery.gte('captured_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
  } else if (period === 'monthly') {
    snapshotsQuery = snapshotsQuery.gte('captured_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
  }

  const [{ data: snapshots }, { data: accountSnapshots }] = await Promise.all([
    snapshotsQuery.returns<SnapshotRow[]>(),
    supabase
      .from('account_metric_snapshots')
      .select('platform_connection_id, captured_at, followers')
      .returns<AccountSnapshotRow[]>(),
  ])

  // Reduce to the latest reading per content within the window (never sum multiple snapshots of
  // the same video — that would double-count, not track growth).
  const latestPerContent = new Map<string, SnapshotRow>()
  for (const row of snapshots ?? []) {
    const existing = latestPerContent.get(row.platform_content_id)
    if (!existing || row.captured_at > existing.captured_at) latestPerContent.set(row.platform_content_id, row)
  }

  // Same reduction for follower counts — always the latest known value, regardless of period.
  const latestFollowersByConnection = new Map<string, AccountSnapshotRow>()
  for (const row of accountSnapshots ?? []) {
    const existing = latestFollowersByConnection.get(row.platform_connection_id)
    if (!existing || row.captured_at > existing.captured_at) latestFollowersByConnection.set(row.platform_connection_id, row)
  }

  const perAvatarPlatform = new Map<string, Map<PlatformName, MetricTotals>>()
  const perAvatarCombined = new Map<string, MetricTotals>()

  for (const row of latestPerContent.values()) {
    const pc = row.platform_content
    if (!pc) continue
    const connection = connectionById.get(pc.platform_connection_id)
    if (!connection) continue
    const avatarId = connection.avatar_id

    if (!perAvatarPlatform.has(avatarId)) perAvatarPlatform.set(avatarId, new Map())
    const byPlatform = perAvatarPlatform.get(avatarId)!
    if (!byPlatform.has(pc.platform)) byPlatform.set(pc.platform, emptyTotals())
    addInto(byPlatform.get(pc.platform)!, row)

    if (!perAvatarCombined.has(avatarId)) perAvatarCombined.set(avatarId, emptyTotals())
    addInto(perAvatarCombined.get(avatarId)!, row)
  }

  return (avatars ?? []).map((avatar) => {
    const byPlatform = perAvatarPlatform.get(avatar.id) ?? new Map<PlatformName, MetricTotals>()
    const combined = perAvatarCombined.get(avatar.id) ?? emptyTotals()
    finalizeEngagementRate(combined)

    const perPlatform: PlatformTotals[] = Array.from(byPlatform.entries()).map(([platform, totals]) => {
      finalizeEngagementRate(totals)
      return { platform, ...totals }
    })

    const avatarConnections = (connections ?? []).filter((c) => c.avatar_id === avatar.id)
    const followers = avatarConnections.map((c) => {
      const snap = latestFollowersByConnection.get(c.id)
      return { platform: c.platform, followers: snap?.followers ?? null, capturedAt: snap?.captured_at ?? null }
    })

    return { avatarId: avatar.id, avatarName: avatar.name, followers, perPlatform, combined }
  })
}

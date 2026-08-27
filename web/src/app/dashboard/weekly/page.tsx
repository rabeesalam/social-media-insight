import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Avatar, PlatformName } from '@/types/database'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'

const PLATFORM_METRIC_LABEL: Record<PlatformName, string> = {
  youtube: 'video views',
  tiktok: 'video views',
  instagram: 'reach',
  facebook: 'reach',
  threads: 'views',
  x: 'impressions',
}

interface SnapshotRow {
  platform_content_id: string
  captured_at: string
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  platform_content: {
    platform: PlatformName
    platform_connection_id: string
  } | null
}

export default async function WeeklyPage() {
  const supabase = await createClient()

  const { data: avatars } = await supabase
    .from('avatars')
    .select('id, device_id, name, handle, profile_image_url, created_at, updated_at')
    .order('name')
    .returns<Avatar[]>()

  const { data: connections } = await supabase
    .from('platform_connections_safe')
    .select('id, avatar_id, platform')
    .returns<{ id: string; avatar_id: string; platform: PlatformName }[]>()

  const connectionToAvatar = new Map((connections ?? []).map((c) => [c.id, c.avatar_id]))

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const { data: snapshots, error } = await supabase
    .from('metric_snapshots')
    .select('platform_content_id, captured_at, views, likes, comments, shares, platform_content!inner(platform, platform_connection_id)')
    .gte('captured_at', sevenDaysAgo)
    .returns<SnapshotRow[]>()

  // Reduce to the latest snapshot per content within the window, then sum per (avatar, platform).
  const latestPerContent = new Map<string, SnapshotRow>()
  for (const row of snapshots ?? []) {
    const existing = latestPerContent.get(row.platform_content_id)
    if (!existing || row.captured_at > existing.captured_at) {
      latestPerContent.set(row.platform_content_id, row)
    }
  }

  type Totals = { views: number; likes: number; comments: number; shares: number; contentCount: number }
  const totalsByAvatarPlatform = new Map<string, Totals>()

  for (const row of latestPerContent.values()) {
    const pc = row.platform_content
    if (!pc) continue
    const avatarId = connectionToAvatar.get(pc.platform_connection_id)
    if (!avatarId) continue
    const key = `${avatarId}::${pc.platform}`
    const totals = totalsByAvatarPlatform.get(key) ?? { views: 0, likes: 0, comments: 0, shares: 0, contentCount: 0 }
    totals.views += row.views ?? 0
    totals.likes += row.likes ?? 0
    totals.comments += row.comments ?? 0
    totals.shares += row.shares ?? 0
    totals.contentCount += 1
    totalsByAvatarPlatform.set(key, totals)
  }

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Weekly summary</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Latest metrics captured per content in the last 7 days, across all connected avatars. Totals
        are shown per platform, not blended — a YouTube view and an Instagram reach are different
        things (see docs/decisions/0005-metric-normalization.md).
      </p>

      {error && (
        <div className="mb-4 rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">
          Failed to load: {error.message}
        </div>
      )}

      {!avatars || avatars.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-400">
          No avatars yet.
        </div>
      ) : (
        <div className="space-y-4">
          {avatars.map((avatar) => {
            const avatarConnections = (connections ?? []).filter((c) => c.avatar_id === avatar.id)
            return (
              <div key={avatar.id} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <Link href={`/dashboard/avatars/${avatar.id}`} className="font-medium hover:underline">
                    {avatar.name}
                  </Link>
                </div>
                {avatarConnections.length === 0 ? (
                  <p className="text-sm text-neutral-500">No platforms connected.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                    {avatarConnections.map((conn) => {
                      const totals = totalsByAvatarPlatform.get(`${avatar.id}::${conn.platform}`)
                      return (
                        <div key={conn.id} className="rounded-md border border-neutral-800 p-3">
                          <p className="text-xs text-neutral-500">{PLATFORM_DISPLAY_NAME[conn.platform]}</p>
                          {totals ? (
                            <>
                              <p className="text-lg font-semibold tabular-nums">
                                {new Intl.NumberFormat('en-US', { notation: 'compact' }).format(totals.views)}
                              </p>
                              <p className="text-xs text-neutral-500">{PLATFORM_METRIC_LABEL[conn.platform]}</p>
                              <p className="mt-1 text-xs text-neutral-600">
                                {totals.likes.toLocaleString()} likes · {totals.comments.toLocaleString()} comments
                              </p>
                            </>
                          ) : (
                            <p className="text-sm text-neutral-600">No data this week</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

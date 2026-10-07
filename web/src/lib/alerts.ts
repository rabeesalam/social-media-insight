import { DAY_MS } from '@/lib/filters'
import { staleConnections, type Dataset } from '@/lib/metrics'
import { addDays, dayKey, followerDaily } from '@/lib/series'
import { buildVideoRows, videoDaily, type VideoRow } from '@/lib/videos'
import type { Video } from '@/lib/metrics'
import type { Filters } from '@/lib/filters'

export interface Alert {
  kind: 'breakout' | 'stale' | 'follower_drop' | 'zero_views'
  title: string
  detail: string
  href?: string
}

// In-app alerts (spec "Alerts"). Sending these to Slack or email needs a webhook/mail setup and the
// user's confirmation, so they are shown on the dashboard rather than pushed anywhere.
export function buildAlerts(ds: Dataset, videos: Video[], f: Filters, now: number): Alert[] {
  const alerts: Alert[] = []
  const avatarName = new Map(ds.avatars.map((a) => [a.id, a.name]))

  const cutoff = dayKey(now - 2 * DAY_MS)
  for (const v of videos) {
    const hit = videoDaily(v, now, f.breakoutMult, f.breakoutFloor).find((d) => d.isBreakout && d.day >= cutoff)
    if (hit) {
      alerts.push({
        kind: 'breakout',
        title: `Breakout: ${(v.title ?? 'video').slice(0, 70)}`,
        detail: `${avatarName.get(v.avatarId)} · ${v.platform} · +${Math.round(hit.gain).toLocaleString('en-US')} views on ${hit.day}`,
        href: `/dashboard/videos/${v.id}`,
      })
    }
  }

  for (const s of staleConnections(ds, now)) {
    alerts.push({
      kind: 'stale',
      title: `${s.avatarName} · ${s.connection.platform} needs attention`,
      detail: s.reason === 'needs_reconnect' ? 'Sign-in expired — reconnect on the phone app.' : s.reason === 'never' ? 'Never synced.' : 'No update in over 24 hours.',
    })
  }

  // Net follower loss on 3 consecutive days, using real (non-estimated) readings only.
  for (const a of ds.avatars) {
    const conns = ds.connections.filter((c) => c.avatarId === a.id)
    const series = followerDaily(conns, { startMs: now - 6 * DAY_MS, endMs: now })
    const days = [0, 1, 2, 3].map((i) => addDays(dayKey(now), -3 + i))
    const pts = days.map((d) => series.get(d))
    if (pts.every((p) => p && !p.est)) {
      const drops = [1, 2, 3].every((i) => (pts[i] as { value: number }).value < (pts[i - 1] as { value: number }).value)
      if (drops) alerts.push({ kind: 'follower_drop', title: `${a.name}: followers fell 3 days in a row`, detail: 'Net loss each day for the last 3 days.' })
    }
  }

  const rows: VideoRow[] = buildVideoRows(videos, { startMs: now - 7 * DAY_MS, endMs: now }, f, now)
  for (const r of rows) {
    if (r.zeroViews48h) {
      alerts.push({
        kind: 'zero_views',
        title: `0 views after 48 h: ${(r.video.title ?? 'video').slice(0, 60)}`,
        detail: `${avatarName.get(r.video.avatarId)} · ${r.video.platform} — sync lag or a real problem.`,
        href: `/dashboard/videos/${r.video.id}`,
      })
    }
  }
  return alerts
}

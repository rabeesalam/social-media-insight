import { createClient } from '@/lib/supabase/server'
import { json, paramsOf, toCsv } from '@/lib/api'
import { contentInsights, timeseriesData, videoRows } from '@/lib/apiData'
import { computeTotals, engagementRates, followerStats } from '@/lib/metrics'
import { loadScoped } from '@/lib/scope'
import { buildSeries } from '@/lib/series'
import { DAY_MS } from '@/lib/filters'

// The current view's data as CSV, using the same parameters as the page. Behind the existing login.
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)

  const raw = paramsOf(request)
  const dataset = String(Array.isArray(raw.dataset) ? raw.dataset[0] : (raw.dataset ?? 'videos'))
  try {
    const sc = await loadScoped(raw)
    let header: string[]
    let rows: unknown[][]

    if (dataset === 'timeseries') {
      const d = timeseriesData(sc)
      header = ['series', 'date', d.metric, 'estimated']
      rows = d.series.flatMap((s) => s.points.map((p) => [s.name, p.date, p.value, p.estimated]))
    } else if (dataset === 'followers') {
      const chart = buildSeries({
        filters: { ...sc.filters, metric: 'followers', indexed: false },
        window: sc.range.current,
        previous: null,
        avatars: sc.avatars,
        videos: sc.videos,
        conns: sc.connections,
      })
      header = ['series', 'date', 'followers', 'estimated']
      rows = chart.series.flatMap((s) => chart.rows.map((r) => [s.name, r.x, r[s.key] ?? '', r[`${s.key}__est`] === true]))
    } else if (dataset === 'leaderboard') {
      const weeks = Math.max(1 / 7, (sc.range.current.endMs - sc.range.current.startMs) / (7 * DAY_MS))
      header = ['avatar', 'views_gained', 'views_posted', 'followers', 'followers_gained', 'engagement_pct', 'typical_views', 'hit_rate_pct', 'videos_posted', 'posts_per_week']
      rows = sc.avatars.map((a) => {
        const vids = sc.videos.filter((v) => v.avatarId === a.id)
        const t = computeTotals(vids, sc.range.current, sc.filters.hitThreshold)
        const fs = followerStats(sc.connections.filter((c) => c.avatarId === a.id), sc.range.current)
        return [a.name, t.viewsGained, t.postedViews, fs.current, fs.gained, engagementRates(t, sc.filters.basis).engagement, t.typicalViews, t.hitRate, t.postedCount, (t.postedCount / weeks).toFixed(2)]
      })
    } else if (dataset === 'hashtags') {
      const d = contentInsights(sc)
      header = ['hashtag', 'videos', 'typical_views', 'engagement_pct', 'hit_rate_pct']
      rows = d.hashtags.map((h) => [h.key, h.videos, h.typicalViews, h.engagementPct, h.hitRatePct])
    } else {
      // 'videos' and 'movers' share the video table columns; movers is the top 10 by views gained.
      let list = videoRows(sc)
      if (dataset === 'movers') list = list.filter((v) => v.viewsGained > 0).sort((a, b) => b.viewsGained - a.viewsGained).slice(0, 10)
      header = ['id', 'title', 'url', 'avatar', 'platform', 'published_at', 'age_days', 'lifetime_views', 'views_gained', 'views_gained_partial', 'velocity_24h', 'days_to_peak', 'status', 'breakout', 'late_breakout', 'engagement_pct', 'hashtags']
      rows = list.map((v) => [v.id, v.title, v.url, v.avatar, v.platform, v.publishedAt, v.ageDays, v.lifetimeViews, v.viewsGained, v.viewsGainedPartial, v.velocity24h, v.daysToPeak, v.status, v.breakout, v.lateBreakout, v.engagementPct, v.hashtags.join(' ')])
    }

    return new Response(toCsv(header, rows), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${dataset}.csv"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
  }
}

import { DAY_MS } from '@/lib/filters'
import { computeTotals, engagementRates, followerStats, pctChange } from '@/lib/metrics'
import type { Scoped } from '@/lib/scope'
import { buildSeries, dailyGains, listDays } from '@/lib/series'
import { buildVideoRows, groupInsights } from '@/lib/videos'
import { buildHealth } from '@/lib/health'

export function summaryData(sc: Scoped) {
  const { filters: f, range, videos, connections, now } = sc
  const cur = computeTotals(videos, range.current, f.hitThreshold)
  const prev = range.previous ? computeTotals(videos, range.previous, f.hitThreshold) : null
  const fc = followerStats(connections, range.current)
  const fp = range.previous ? followerStats(connections, range.previous) : null
  const multi = new Set(videos.filter((v) => v.snaps.length > 0).map((v) => v.platform)).size > 1
  const rate = (t: typeof cur) => {
    const r = engagementRates(t, f.basis)
    return multi ? r.crossPlatformEngagement : r.engagement
  }
  const sparkWin = { startMs: now - 30 * DAY_MS, endMs: now }
  const d = dailyGains(videos, sparkWin, 'views')
  const views = f.basis === 'gained' ? cur.viewsGained : cur.postedViews
  const viewsPrev = prev ? (f.basis === 'gained' ? prev.viewsGained : prev.postedViews) : null
  return {
    range: { from: new Date(range.current.startMs).toISOString(), to: new Date(range.current.endMs).toISOString(), label: range.label },
    basis: f.basis,
    views: { value: views, previous: viewsPrev, changePct: pctChange(views, viewsPrev) },
    followers: { current: fc.current, gained: fc.gained, previousGained: fp?.gained ?? null, growthPct: fc.growthPct },
    engagement: { value: rate(cur), previous: prev ? rate(prev) : null, definition: multi ? 'likes+comments' : 'likes+comments+shares+saves' },
    videosPosted: { value: cur.postedCount, previous: prev?.postedCount ?? null },
    hits: { value: cur.hits, hitRate: cur.hitRate, threshold: f.hitThreshold },
    typicalViews: cur.typicalViews,
    partialVideos: cur.partialVideos,
    sparkline: listDays(sparkWin).map((day) => ({ date: day, value: Math.round(d.get(day)?.value ?? 0) })),
  }
}

export function timeseriesData(sc: Scoped) {
  const { filters, range, avatars, videos, connections } = sc
  const chart = buildSeries({ filters, window: range.current, previous: range.previous, avatars, videos, conns: connections })
  return {
    metric: filters.metric,
    granularity: chart.granularity,
    series: chart.series.map((s) => ({
      name: s.name,
      points: chart.rows.map((r) => ({ date: r.x, value: typeof r[s.key] === 'number' ? r[s.key] : null, estimated: r[`${s.key}__est`] === true })),
    })),
    spikes: chart.spikes,
  }
}

export function gridData(sc: Scoped) {
  const { filters, range, avatars, videos, connections } = sc
  const platforms = Array.from(new Set(connections.map((c) => c.platform)))
  const weeks = Math.max(1 / 7, (range.current.endMs - range.current.startMs) / (7 * DAY_MS))
  return {
    platforms,
    rows: avatars.map((a) => ({
      avatar: a.name,
      cells: platforms.map((p) => {
        const conns = connections.filter((c) => c.avatarId === a.id && c.platform === p)
        if (conns.length === 0) return null
        const t = computeTotals(videos.filter((v) => v.avatarId === a.id && v.platform === p), range.current, filters.hitThreshold)
        const fs = followerStats(conns, range.current)
        return {
          typicalViews: t.typicalViews,
          engagementRate: engagementRates(t, 'gained').engagement,
          postsPerWeek: t.postedCount / weeks,
          viewsGained: t.viewsGained,
          followerGrowthPct: fs.growthPct,
          followersGained: fs.gained,
        }
      }),
    })),
  }
}

export function videoRows(sc: Scoped) {
  const { filters, range, videos, ds, now } = sc
  const name = new Map(ds.avatars.map((a) => [a.id, a.name]))
  return buildVideoRows(videos, range.current, filters, now).map((r) => ({
    id: r.video.id,
    title: r.video.title,
    url: r.video.url,
    avatar: name.get(r.video.avatarId) ?? '',
    platform: r.video.platform,
    publishedAt: r.video.publishedAt === null ? null : new Date(r.video.publishedAt).toISOString(),
    ageDays: r.ageDays === null ? null : Math.round(r.ageDays * 10) / 10,
    lifetimeViews: r.lifetime,
    viewsGained: r.gained,
    viewsGainedPartial: r.gainedPartial,
    velocity24h: r.velocity24h,
    velocity72h: r.velocity72h,
    daysToPeak: r.daysToPeak,
    status: r.status,
    breakout: r.breakout,
    lateBreakout: r.lateBreakout,
    engagementPct: r.engagement,
    hashtags: r.hashtags,
    sparkline14d: r.spark,
  }))
}

export function contentInsights(sc: Scoped) {
  const { filters, range, videos, now } = sc
  const rows = buildVideoRows(videos, range.current, filters, now)
  const view = (list: ReturnType<typeof groupInsights>) => list.map((i) => ({ key: i.key, videos: i.videos, typicalViews: i.typicalViews, engagementPct: i.engagement, hitRatePct: i.hitRate }))
  return {
    hashtags: view(groupInsights(rows, (r) => r.hashtags, filters.hitThreshold)),
    platforms: view(groupInsights(rows, (r) => [r.video.platform], filters.hitThreshold)),
  }
}

export function healthData(sc: Scoped) {
  return { accounts: buildHealth(sc.ds, sc.now) }
}

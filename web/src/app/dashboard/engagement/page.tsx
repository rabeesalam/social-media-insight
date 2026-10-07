import { FilterBar } from '@/components/FilterBar'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { ScatterPlot, type Dot } from '@/components/charts/ScatterPlot'
import { Card, DataSince, Empty, PageHeader } from '@/components/ui'
import { fmtPct } from '@/lib/format'
import { lifetimeAt, median } from '@/lib/metrics'
import { tryScope } from '@/lib/scope'
import { avatarColor, bucketOf, dailyGains, firstSnapshotDay, listDays, makeGroups, resolveGranularity, type ChartRow } from '@/lib/series'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'

export default async function EngagementPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const res = await tryScope(await searchParams)
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { filters, range, avatars, videos, connections, ds } = sc
  const since = firstSnapshotDay(ds)

  const platformsWithData = new Set(videos.filter((v) => v.snaps.length > 0).map((v) => v.platform))
  // Likes + comments only whenever platforms are mixed (YouTube reports no shares or saves).
  const cross = filters.split !== 'platform' && platformsWithData.size > 1

  // 1. Engagement rate over time = engagement gained / views gained per bucket.
  const g = resolveGranularity(filters.granularity, range.current)
  const days = listDays(range.current)
  const bucketKeys: string[] = []
  for (const d of days) {
    const k = bucketOf(d, g)
    if (bucketKeys[bucketKeys.length - 1] !== k) bucketKeys.push(k)
  }
  const groups = makeGroups(filters.split, avatars, videos, connections)
  const rows: ChartRow[] = bucketKeys.map((x) => ({ x }))
  const series = groups.map((grp, i) => ({ key: `s${i}`, name: grp.name, color: grp.color }))
  groups.forEach((grp, i) => {
    const v = dailyGains(grp.videos, range.current, 'views')
    const l = dailyGains(grp.videos, range.current, 'likes')
    const c = dailyGains(grp.videos, range.current, 'comments')
    const sh = cross ? new Map() : dailyGains(grp.videos, range.current, 'shares')
    const sv = cross ? new Map() : dailyGains(grp.videos, range.current, 'saves')
    const acc = new Map<string, { views: number; eng: number }>()
    for (const d of days) {
      const k = bucketOf(d, g)
      const cur = acc.get(k) ?? { views: 0, eng: 0 }
      cur.views += v.get(d)?.value ?? 0
      cur.eng += (l.get(d)?.value ?? 0) + (c.get(d)?.value ?? 0) + (sh.get(d)?.value ?? 0) + (sv.get(d)?.value ?? 0)
      acc.set(k, cur)
    }
    rows.forEach((row) => {
      const e = acc.get(row.x as string)
      row[`s${i}`] = e && e.views > 0 ? (e.eng / e.views) * 100 : null
    })
  })
  const overTimeEmpty = !rows.some((r) => series.some((s) => typeof r[s.key] === 'number'))

  // 2. Reach vs engagement scatter (one dot per video).
  const dots: Dot[] = []
  const medianPool: { views: number; eng: number }[] = []
  for (const v of videos) {
    const last = v.snaps[v.snaps.length - 1]
    const views = lifetimeAt(v, range.current.endMs, 'views')
    if (!last || views === null || views <= 0) continue
    const eng = (((last.likes ?? 0) + (last.comments ?? 0) + (cross ? 0 : (last.shares ?? 0) + (last.saves ?? 0))) / views) * 100
    medianPool.push({ views, eng })
    dots.push({
      x: Math.round(eng * 100) / 100,
      y: views,
      color: avatarColor(ds.avatars, v.avatarId),
      label: `${v.title ?? '(untitled)'} — ${PLATFORM_DISPLAY_NAME[v.platform]}`,
      href: `/dashboard/videos/${v.id}`,
    })
  }
  const medViews = median(medianPool.map((p) => p.views))
  const medEng = median(medianPool.map((p) => p.eng))
  const legend = avatars.map((a) => ({ name: a.name, color: avatarColor(ds.avatars, a.id) }))

  // 3. Engagement mix per avatar (share of likes / comments / shares / saves, lifetime).
  const mixRows: ChartRow[] = avatars
    .map((a) => {
      let likes = 0
      let comments = 0
      let shares = 0
      let saves = 0
      for (const v of videos.filter((x) => x.avatarId === a.id)) {
        const last = v.snaps[v.snaps.length - 1]
        if (!last) continue
        likes += last.likes ?? 0
        comments += last.comments ?? 0
        shares += last.shares ?? 0
        saves += last.saves ?? 0
      }
      const total = likes + comments + shares + saves
      if (total === 0) return null
      const pct = (n: number) => Math.round((n / total) * 1000) / 10
      return { x: a.name, likes: pct(likes), comments: pct(comments), shares: pct(shares), saves: pct(saves) } as ChartRow
    })
    .filter((r): r is ChartRow => r !== null)

  return (
    <div>
      <PageHeader title="Engagement" subtitle={`${range.label} · ${cross ? 'likes + comments only (platforms are mixed)' : 'likes + comments + shares + saves'}`} />
      <FilterBar action="/dashboard/engagement" filters={filters} avatarOptions={ds.avatars} platformOptions={sc.platformOptions} show={{ basis: false }} />
      <div className="grid gap-4">
        <Card title="Engagement rate over time" note="Engagement gained ÷ views gained, per period. Shows whether engagement holds as views grow.">
          {overTimeEmpty ? <Empty>No engagement history in this range yet.</Empty> : <SeriesChart rows={rows} series={series} kind="line" yFormat="percent" />}
          <DataSince since={since} />
        </Card>
        <Card
          title="Reach vs. engagement"
          note={`One dot per video. Vertical axis is lifetime views (log), horizontal is engagement rate. Lines mark the median (${medViews === null ? '—' : Math.round(medViews).toLocaleString('en-US')} views, ${fmtPct(medEng)}), splitting high-reach/low-engagement from low-reach/high-engagement videos. Click a dot to open the video.`}
        >
          {dots.length === 0 ? <Empty>No videos with views yet.</Empty> : <ScatterPlot dots={dots} xLabel="Engagement rate (%)" yLabel="Lifetime views" logY xLine={medEng ?? undefined} yLine={medViews ?? undefined} yLineLabel="median views" legend={legend} />}
        </Card>
        <Card title="Engagement mix" note="Share of likes, comments, shares and saves per avatar (lifetime). YouTube reports no shares or saves, so YouTube-heavy avatars skew to likes and comments.">
          {mixRows.length === 0 ? (
            <Empty>No engagement data yet.</Empty>
          ) : (
            <SeriesChart
              rows={mixRows}
              kind="stackedBar"
              yFormat="percent"
              xIsDate={false}
              series={[
                { key: 'likes', name: 'Likes', color: '#f472b6' },
                { key: 'comments', name: 'Comments', color: '#38bdf8' },
                { key: 'shares', name: 'Shares', color: '#a3e635' },
                { key: 'saves', name: 'Saves', color: '#fbbf24' },
              ]}
            />
          )}
        </Card>
      </div>
    </div>
  )
}

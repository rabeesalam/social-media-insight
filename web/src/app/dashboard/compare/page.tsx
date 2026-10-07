import Link from 'next/link'
import { FilterBar } from '@/components/FilterBar'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { Heatmap, type HeatCell } from '@/components/charts/Heatmap'
import { Card, DataSince, Empty, PageHeader } from '@/components/ui'
import { DAY_MS } from '@/lib/filters'
import { fmtInt, fmtPct, fmtSigned } from '@/lib/format'
import { computeTotals, engagementRates, followerStats } from '@/lib/metrics'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import { avatarColor, buildSeries, firstSnapshotDay } from '@/lib/series'

const GRID_METRICS = {
  typical: 'Typical views',
  engagement: 'Engagement rate',
  posts: 'Posts per week',
  growth: 'Follower growth %',
  views: 'Views gained',
} as const
type GridMetric = keyof typeof GRID_METRICS

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const gmRaw = Array.isArray(raw.gm) ? raw.gm[0] : raw.gm
  const gm: GridMetric = gmRaw && gmRaw in GRID_METRICS ? (gmRaw as GridMetric) : 'typical'
  const res = await tryScope(raw)
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { filters, range, avatars, videos, connections, ds } = sc
  const since = firstSnapshotDay(ds)

  const platforms = Array.from(new Set(connections.map((c) => c.platform)))
  const weeks = Math.max(1 / 7, (range.current.endMs - range.current.startMs) / (7 * DAY_MS))

  const cells: HeatCell[][] = avatars.map((a) =>
    platforms.map((p) => {
      const conns = connections.filter((c) => c.avatarId === a.id && c.platform === p)
      if (conns.length === 0) return { value: null, title: `${a.name} · ${PLATFORM_DISPLAY_NAME[p]}: not connected` }
      const vids = videos.filter((v) => v.avatarId === a.id && v.platform === p)
      const t = computeTotals(vids, range.current, filters.hitThreshold)
      if (gm === 'typical') return { value: t.typicalViews, label: t.typicalViews === null ? undefined : fmtInt(Math.round(t.typicalViews)) }
      if (gm === 'engagement') {
        const e = engagementRates(t, 'gained').engagement
        return { value: e, label: e === null ? undefined : fmtPct(e) }
      }
      if (gm === 'posts') return { value: t.postedCount / weeks, label: (t.postedCount / weeks).toFixed(1) }
      if (gm === 'views') return { value: t.viewsGained, label: fmtInt(t.viewsGained) }
      const fs = followerStats(conns, range.current)
      return { value: fs.growthPct, label: fs.growthPct === null ? (fs.gained === null ? undefined : `${fmtSigned(fs.gained)} net`) : fmtPct(fs.growthPct, 1) }
    })
  )

  // Small multiples: one mini chart per avatar, same y axis.
  const minis = avatars.map((a) => ({
    a,
    chart: buildSeries({
      filters: { ...filters, metric: 'views', split: 'none', indexed: false },
      window: range.current,
      previous: null,
      avatars,
      videos: videos.filter((v) => v.avatarId === a.id),
      conns: connections.filter((c) => c.avatarId === a.id),
    }),
  }))
  const yMax = Math.max(0, ...minis.flatMap((m) => m.chart.rows.map((r) => (typeof r.s0 === 'number' ? r.s0 : 0))))

  // Head to head: up to 4 avatars on chosen metrics.
  const h2h = (filters.avatars.length > 0 ? avatars : avatars.slice(0, 4)).slice(0, 4).map((a) => {
    const vids = videos.filter((v) => v.avatarId === a.id)
    const conns = connections.filter((c) => c.avatarId === a.id)
    const t = computeTotals(vids, range.current, filters.hitThreshold)
    const fs = followerStats(conns, range.current)
    return { a, views: t.viewsGained, followers: fs.gained, eng: engagementRates(t, 'gained').crossPlatformEngagement, typical: t.typicalViews, hit: t.hitRate, posts: t.postedCount / weeks }
  })
  const maxOf = (f: (r: (typeof h2h)[number]) => number | null) => Math.max(1e-9, ...h2h.map((r) => Math.abs(f(r) ?? 0)))

  return (
    <div>
      <PageHeader title="Compare" subtitle={`Avatars and platforms side by side · ${range.label}`} />
      <FilterBar action="/dashboard/compare" filters={filters} avatarOptions={ds.avatars} platformOptions={sc.platformOptions} show={{ basis: false, content: false }} />
      <div className="grid gap-4">
        <Card title="Avatar × platform grid" note="Pick a metric. Empty cells mean that avatar has no connected account on the platform.">
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(GRID_METRICS) as GridMetric[]).map((k) => {
              const q = new URLSearchParams(Object.entries(raw).flatMap(([key, v]) => (v === undefined || key === 'gm' ? [] : (Array.isArray(v) ? v : [v]).map((x) => [key, x] as [string, string]))))
              q.set('gm', k)
              return (
                <Link key={k} href={`/dashboard/compare?${q.toString()}`} className={`rounded-md border px-2.5 py-1 text-xs ${k === gm ? 'border-neutral-300 bg-neutral-100 text-neutral-900' : 'border-neutral-700 text-neutral-300 hover:border-neutral-500'}`}>
                  {GRID_METRICS[k]}
                </Link>
              )
            })}
          </div>
          {platforms.length === 0 ? <Empty>No connected accounts.</Empty> : <Heatmap rows={avatars.map((a) => a.name)} cols={platforms.map((p) => PLATFORM_DISPLAY_NAME[p])} cells={cells} format={(v) => v.toLocaleString('en-US', { maximumFractionDigits: 2 })} rowHeader="Avatar" />}
        </Card>

        <Card title="Small multiples" note="Views gained per day for each avatar on the same vertical axis, so trend shapes can be compared side by side.">
          {minis.every((m) => m.chart.empty) ? (
            <Empty>No view history in this range yet.</Empty>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {minis.map((m) => (
                <div key={m.a.id}>
                  <p className="mb-1 text-xs font-medium" style={{ color: avatarColor(ds.avatars, m.a.id) }}>
                    {m.a.name}
                  </p>
                  {m.chart.empty ? <Empty>No data</Empty> : <SeriesChart rows={m.chart.rows} series={[{ ...m.chart.series[0], color: avatarColor(ds.avatars, m.a.id) }]} kind="area" height={140} yMax={yMax} />}
                </div>
              ))}
            </div>
          )}
          <DataSince since={since} />
        </Card>

        <Card title="Head to head" note="Up to 4 avatars on the key metrics. Pick avatars in the filter bar to choose which. Bars are scaled within each row.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Metric</th>
                  {h2h.map((r) => (
                    <th key={r.a.id} className="px-3 py-2 font-medium" style={{ color: avatarColor(ds.avatars, r.a.id) }}>
                      {r.a.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {(
                  [
                    ['Views gained', (r: (typeof h2h)[number]) => r.views, (v: number | null) => fmtInt(v)],
                    ['Followers gained', (r: (typeof h2h)[number]) => r.followers, (v: number | null) => fmtSigned(v)],
                    ['Engagement (likes + comments)', (r: (typeof h2h)[number]) => r.eng, (v: number | null) => fmtPct(v)],
                    ['Typical views', (r: (typeof h2h)[number]) => r.typical, (v: number | null) => (v === null ? '—' : fmtInt(Math.round(v)))],
                    ['Hit rate', (r: (typeof h2h)[number]) => r.hit, (v: number | null) => fmtPct(v, 1)],
                    ['Posts per week', (r: (typeof h2h)[number]) => r.posts, (v: number | null) => (v === null ? '—' : v.toFixed(1))],
                  ] as const
                ).map(([label, get, fmt]) => {
                  const max = maxOf(get)
                  return (
                    <tr key={label}>
                      <td className="px-3 py-2.5 text-neutral-300">{label}</td>
                      {h2h.map((r) => {
                        const v = get(r)
                        return (
                          <td key={r.a.id} className="px-3 py-2.5">
                            <div className="tabular-nums">{fmt(v)}</div>
                            <div className="mt-1 h-1.5 w-full max-w-36 rounded bg-neutral-800">
                              <div className="h-full rounded" style={{ width: `${Math.min(100, (Math.abs(v ?? 0) / max) * 100)}%`, background: avatarColor(ds.avatars, r.a.id) }} />
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

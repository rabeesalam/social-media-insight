import { FilterBar } from '@/components/FilterBar'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { Heatmap, type HeatCell } from '@/components/charts/Heatmap'
import { ScatterPlot, type Dot } from '@/components/charts/ScatterPlot'
import { Card, Empty, exportUrl, Locked, PageHeader } from '@/components/ui'
import { REPORTING_TZ } from '@/lib/filters'
import { fmtInt, fmtPct } from '@/lib/format'
import { lifetimeAt, median, type Video } from '@/lib/metrics'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import { addDays, avatarColor, dayKey, listDays, type ChartRow } from '@/lib/series'
import { buildVideoRows, groupInsights } from '@/lib/videos'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function zonedParts(ms: number): { dow: number; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: REPORTING_TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms))
  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  return { dow: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(wd), hour }
}

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const res = await tryScope(await searchParams)
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { filters, range, avatars, videos, ds, now } = sc

  const posted = videos.filter((v): v is Video & { publishedAt: number } => v.publishedAt !== null && v.publishedAt >= range.current.startMs && v.publishedAt <= range.current.endMs)
  const lifetime = (v: Video) => lifetimeAt(v, range.current.endMs, 'views') ?? 0

  // Spike map: x = publish date, y = views (log), colour = avatar, size = engagement rate.
  const spike: Dot[] = []
  for (const v of posted) {
    const views = lifetime(v)
    if (views <= 0) continue
    const last = v.snaps[v.snaps.length - 1]
    const eng = last && last.views ? (((last.likes ?? 0) + (last.comments ?? 0) + (last.shares ?? 0) + (last.saves ?? 0)) / last.views) * 100 : 0
    spike.push({ x: v.publishedAt, y: views, z: Math.round(eng * 100) / 100, color: avatarColor(ds.avatars, v.avatarId), label: `${v.title ?? '(untitled)'} — ${PLATFORM_DISPLAY_NAME[v.platform]}`, href: `/dashboard/videos/${v.id}` })
  }
  const legend = avatars.map((a) => ({ name: a.name, color: avatarColor(ds.avatars, a.id) }))

  // Views spread per avatar: a dot for every video (jittered), with the hit threshold line.
  const spread: Dot[] = []
  const medians: { name: string; median: number | null; count: number }[] = []
  avatars.forEach((a, i) => {
    const list = posted.filter((v) => v.avatarId === a.id)
    medians.push({ name: a.name, median: median(list.map(lifetime).filter((x) => x > 0)), count: list.length })
    list.forEach((v, j) => {
      const views = lifetime(v)
      if (views <= 0) return
      spread.push({ x: i + (((j * 37) % 100) / 100 - 0.5) * 0.6, y: views, color: avatarColor(ds.avatars, a.id), label: `${a.name}: ${v.title ?? '(untitled)'}`, href: `/dashboard/videos/${v.id}` })
    })
  })

  // Hit rate and typical views by month (grouped bars per avatar).
  const months = Array.from(new Set(posted.map((v) => dayKey(v.publishedAt).slice(0, 7)))).sort()
  const monthRows = (kind: 'hit' | 'typical'): ChartRow[] =>
    months.map((m) => {
      const row: ChartRow = { x: m }
      avatars.forEach((a, i) => {
        const list = posted.filter((v) => v.avatarId === a.id && dayKey(v.publishedAt).startsWith(m)).map(lifetime)
        row[`s${i}`] = list.length === 0 ? null : kind === 'hit' ? (list.filter((x) => x >= filters.hitThreshold).length / list.length) * 100 : (median(list) ?? 0)
      })
      return row
    })
  const monthSeries = avatars.map((a, i) => ({ key: `s${i}`, name: a.name, color: avatarColor(ds.avatars, a.id) }))

  // Posting calendar: last 60 days of the range, videos posted per day per avatar, shaded by views.
  const calEnd = dayKey(range.current.endMs)
  const calStartRaw = addDays(calEnd, -59)
  const rangeStart = dayKey(range.current.startMs)
  const calStart = rangeStart > calStartRaw ? rangeStart : calStartRaw
  const calDays = listDays({ startMs: range.current.startMs > 0 ? Math.max(range.current.startMs, 0) : 0, endMs: range.current.endMs }).filter((d) => d >= calStart && d <= calEnd)
  const calCells: HeatCell[][] = avatars.map((a) =>
    calDays.map((d) => {
      const list = posted.filter((v) => v.avatarId === a.id && dayKey(v.publishedAt) === d)
      const views = list.reduce((s, v) => s + lifetime(v), 0)
      return { value: list.length ? views : null, title: list.length ? `${a.name} · ${d}: ${list.length} video${list.length > 1 ? 's' : ''}, ${fmtInt(views)} views` : `${a.name} · ${d}: no posts` }
    })
  )

  // Posting day and hour (typical views by slot).
  const slots = new Map<string, number[]>()
  for (const v of posted) {
    const { dow, hour } = zonedParts(v.publishedAt)
    const k = `${dow}-${hour}`
    slots.set(k, [...(slots.get(k) ?? []), lifetime(v)])
  }
  const slotCells: HeatCell[][] = WEEKDAYS.map((_, dow) =>
    Array.from({ length: 24 }, (_, hour) => {
      const list = slots.get(`${dow}-${hour}`)
      const m = list ? median(list) : null
      return { value: m, title: list ? `${WEEKDAYS[dow]} ${hour}:00 · ${list.length} videos, typical ${fmtInt(Math.round(m ?? 0))} views` : `${WEEKDAYS[dow]} ${hour}:00 · no posts` }
    })
  )

  // Topic and hashtag performance (hashtags parsed from captions).
  const rows = buildVideoRows(posted, range.current, filters, now)
  const tagRows = groupInsights(rows, (r) => r.hashtags, filters.hitThreshold).filter((t) => t.videos >= 2).slice(0, 25)

  return (
    <div>
      <PageHeader title="Content" subtitle={`${posted.length} videos posted in ${range.label}`} />
      <FilterBar action="/dashboard/content" filters={filters} avatarOptions={ds.avatars} platformOptions={sc.platformOptions} show={{ basis: false }} />
      <div className="grid gap-4">
        <Card title="Spike map" note="x = publish date, y = lifetime views (log), colour = avatar, dot size = engagement rate. Viral videos stand out at a glance; click a dot for its drill-down.">
          {spike.length === 0 ? <Empty>No videos posted in this range.</Empty> : <ScatterPlot dots={spike} xLabel="Published" yLabel="Views" xIsDate logY yLine={filters.hitThreshold} yLineLabel="hit threshold" legend={legend} height={380} />}
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Views spread per avatar" note={`Every video as a dot, one column per avatar (left to right: ${avatars.map((a) => a.name).join(', ')}). Dashed line = hit threshold.`}>
            {spread.length === 0 ? <Empty>No videos in range.</Empty> : <ScatterPlot dots={spread} xLabel="Avatar" yLabel="Views" logY yLine={filters.hitThreshold} yLineLabel="hit threshold" legend={legend} />}
            <ul className="mt-2 grid gap-x-6 text-xs text-neutral-400 sm:grid-cols-2">
              {medians.map((m) => (
                <li key={m.name}>
                  {m.name}: typical {m.median === null ? '—' : fmtInt(Math.round(m.median))} views across {m.count} videos
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Hit rate by month" note="Share of videos posted that month at or above the hit threshold. Shows whether an avatar is getting more consistent.">
            {months.length === 0 ? <Empty>No videos in range.</Empty> : <SeriesChart rows={monthRows('hit')} series={monthSeries} kind="bar" yFormat="percent" />}
          </Card>
          <Card title="Typical views by month" note="Median lifetime views of the videos posted that month.">
            {months.length === 0 ? <Empty>No videos in range.</Empty> : <SeriesChart rows={monthRows('typical')} series={monthSeries} kind="bar" />}
          </Card>
          <Card title="Posting day and hour" note={`Typical (median) views by posting slot, ${REPORTING_TZ}. Low priority: day of week was flat in the original data.`}>
            {posted.length === 0 ? <Empty>No videos in range.</Empty> : <Heatmap rows={WEEKDAYS} cols={Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h) : ''))} cells={slotCells} format={(v) => fmtInt(Math.round(v))} small rowHeader="" />}
          </Card>
        </div>
        <Card title="Posting calendar" note="Videos posted per day per avatar, shaded by the views those videos have. Hover a cell for details. Last 60 days of the range.">
          {calDays.length === 0 ? <Empty>No days in range.</Empty> : <Heatmap rows={avatars.map((a) => a.name)} cols={calDays.map((d, i) => (i % 7 === 0 ? d.slice(5) : ''))} cells={calCells} format={(v) => fmtInt(v)} small />}
        </Card>
        <Card title="Topic and hashtag performance" note="Hashtags parsed from captions (hashtags used by at least 2 videos). Topics need a topic field in the database, which is not set up yet." exportHref={exportUrl('hashtags', filters)}>
          {tagRows.length === 0 ? (
            <Empty>No hashtag is used by 2 or more videos in this range.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Hashtag</th>
                    <th className="px-3 py-2 text-right font-medium">Videos</th>
                    <th className="px-3 py-2 text-right font-medium">Typical views</th>
                    <th className="px-3 py-2 text-right font-medium">Engagement</th>
                    <th className="px-3 py-2 text-right font-medium">Hit rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {tagRows.map((t) => (
                    <tr key={t.key}>
                      <td className="px-3 py-2">#{t.key}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.videos}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{t.typicalViews === null ? '—' : fmtInt(Math.round(t.typicalViews))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(t.engagement)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtPct(t.hitRate, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="grid gap-4 lg:grid-cols-2">
          <Locked title="Video length vs. views">Needs the video duration, which the sync does not store yet (spec F8). It requires a change to the phone app and a database column.</Locked>
          <Locked title="Brand mention impact">Needs brands and a brand-mention flag stored in the database, which is not set up yet. Meanwhile use the &quot;Caption contains&quot; filter (for example purevpn) to compare any slice of videos.</Locked>
        </div>
      </div>
    </div>
  )
}

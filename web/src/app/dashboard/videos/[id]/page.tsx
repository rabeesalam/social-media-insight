import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { Badge, BackLink, Card, Empty, Locked } from '@/components/ui'
import { DAY_MS, REPORTING_TZ, parseFilters } from '@/lib/filters'
import { fmtInt, fmtPct } from '@/lib/format'
import { cumulativeAt, lifetimeAt, gainOf } from '@/lib/metrics'
import { PLATFORM_COLOR, dayKey, type ChartRow } from '@/lib/series'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import { summarize, typicalCurve, videoProjection } from '@/lib/videoDetail'
import { findCrossPosts } from '@/lib/videos'

function fmtDate(ms: number | null): string {
  return ms === null ? '—' : new Intl.DateTimeFormat('en-US', { timeZone: REPORTING_TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms))
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums">{value}</p>
      {note && <p className="text-xs text-neutral-600">{note}</p>}
    </div>
  )
}

export default async function VideoDrillDown({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const raw = await searchParams
  const res = await tryScope(raw)
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { ds, now } = sc
  const f = parseFilters(raw)
  const v = ds.videos.find((x) => x.id === id)
  if (!v) notFound()

  const avatar = ds.avatars.find((a) => a.id === v.avatarId)
  const sum = summarize(v, now, f.breakoutMult, f.breakoutFloor)
  const lifetime = lifetimeAt(v, now, 'views')
  const ageDays = v.publishedAt === null ? null : (now - v.publishedAt) / DAY_MS
  const g24 = gainOf(v, { startMs: now - DAY_MS, endMs: now }, 'views')
  const g7 = gainOf(v, { startMs: now - 7 * DAY_MS, endMs: now }, 'views')
  const peakReal = sum.daily.filter((d) => !d.est)
  const lateBreakout = sum.daysToPeak !== null && sum.daysToPeak >= 7 && sum.biggest?.isBreakout === true
  const breakoutDays = sum.daily.filter((d) => d.isBreakout)
  const projHorizon = f.projection || 30

  // Daily growth: bars (grey ordinary days, blue breakout days) + lifetime line in a second chart.
  const growthRows: ChartRow[] = sum.daily.map((d) => ({
    x: d.day,
    ordinary: d.isBreakout ? null : Math.round(d.gain),
    breakout: d.isBreakout ? Math.round(d.gain) : null,
  }))
  const lifetimeRows: ChartRow[] = sum.daily.map((d) => ({ x: d.day, s0: d.lifetime, s0__est: d.est }))
  const hasHistory = v.snaps.length >= 2

  const typical = typicalCurve(v, ds.videos, 30)
  const typicalDraw = typical.rows.some((r) => typeof r.typical === 'number')
  const proj = videoProjection(v, ds.videos, projHorizon, now)

  // Engagement over time (likes, comments, shares gained per day) + rate line.
  const engRows: ChartRow[] = []
  let prevL = 0
  let prevC = 0
  let prevS = 0
  let prevV = 0
  if (v.publishedAt !== null) {
    for (const d of sum.daily) {
      const end = Math.min(now, Date.parse(`${d.day}T00:00:00Z`) + DAY_MS)
      const t = Math.min(end, now)
      const l = cumulativeAt(v, 'likes', t)
      const c = cumulativeAt(v, 'comments', t)
      const s = cumulativeAt(v, 'shares', t)
      const vw = cumulativeAt(v, 'views', t)
      if (l === null || c === null || vw === null) continue
      engRows.push({
        x: d.day,
        likes: Math.round(l - prevL),
        comments: Math.round(c - prevC),
        shares: s === null ? null : Math.round(s - prevS),
        rate: vw > 0 ? Math.round(((l + c + (s ?? 0)) / vw) * 1000) / 10 : null,
      })
      prevL = l
      prevC = c
      prevS = s ?? prevS
      prevV = vw
    }
  }
  void prevV

  // Other platforms: cross-posted siblings on the same chart (lifetime views by days since posting).
  const siblings = findCrossPosts(ds.videos.filter((x) => x.avatarId === v.avatarId))
    .filter((p) => p.a.id === v.id || p.b.id === v.id)
    .map((p) => (p.a.id === v.id ? p.b : p.a))
  const sibRows: ChartRow[] = []
  if (siblings.length > 0 && v.publishedAt !== null) {
    const maxDay = Math.min(30, Math.floor(ageDays ?? 0))
    for (let n = 0; n <= maxDay; n++) {
      const row: ChartRow = { x: `Day ${n}` }
      ;[v, ...siblings].forEach((vid, i) => {
        const val = vid.publishedAt === null ? null : cumulativeAt(vid, 'views', vid.publishedAt + n * DAY_MS)
        row[`s${i}`] = val === null ? null : Math.round(val)
      })
      sibRows.push(row)
    }
  }
  const sibSeries = [v, ...siblings].map((vid, i) => ({ key: `s${i}`, name: PLATFORM_DISPLAY_NAME[vid.platform], color: PLATFORM_COLOR[vid.platform] }))

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <BackLink href="/dashboard/videos">← Videos</BackLink>
        {v.url && (
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-sm text-neutral-400 hover:text-neutral-100">
            Watch on {PLATFORM_DISPLAY_NAME[v.platform]} ↗
          </a>
        )}
      </div>

      <div className="mb-5">
        <h1 className="line-clamp-3 text-lg font-semibold">{v.title ?? '(untitled)'}</h1>
        <p className="mt-1 text-sm text-neutral-500">
          {avatar ? <Link href={`/dashboard/avatars/${avatar.id}`} className="hover:underline">{avatar.name}</Link> : 'Unknown avatar'} · {PLATFORM_DISPLAY_NAME[v.platform]} · posted {fmtDate(v.publishedAt)}
          {ageDays !== null && ` · ${ageDays.toFixed(0)} days old`}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ageDays !== null && <Badge>{ageDays < 3 ? 'New' : 'Growing'}</Badge>}
          {breakoutDays.length > 0 && <Badge tone="blue">Breakout</Badge>}
          {lateBreakout && <Badge tone="amber">Late breakout</Badge>}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Lifetime views" value={fmtInt(lifetime)} />
        <Stat label="Gained last 24 h" value={g24 ? fmtInt(Math.round(g24.value)) : '—'} note={g24?.partial ? 'partly estimated' : undefined} />
        <Stat label="Gained last 7 days" value={g7 ? fmtInt(Math.round(g7.value)) : '—'} note={g7?.partial ? 'partly estimated' : undefined} />
        <Stat label="Biggest day" value={sum.biggest ? `${fmtInt(Math.round(sum.biggest.gain))}` : '—'} note={sum.biggest ? `${sum.biggest.day}${sum.biggest.est ? ' (estimated)' : ''}` : undefined} />
        <Stat label="Days to peak" value={sum.daysToPeak === null ? '—' : String(sum.daysToPeak)} />
        <Stat label="Share of views in first 48 h" value={sum.first48hShare === null ? '—' : fmtPct(sum.first48hShare, 0)} note={sum.first48hShare === null ? 'needs syncs in the first days' : undefined} />
        <Stat label="Engagement now" value={fmtPct(sum.engagementNow)} note="likes + comments" />
        <Stat label="Engagement at day 3" value={fmtPct(sum.engagementDay3)} note={sum.engagementDay3 === null ? 'no sync around day 3' : 'likes + comments'} />
      </div>

      {!hasHistory && (
        <div className="mb-6">
          <Locked title="Daily gains need 2 or more snapshots">This video has {v.snaps.length} saved snapshot{v.snaps.length === 1 ? '' : 's'}. Once the phone app has synced it on two different days, daily gains and breakout days appear here.</Locked>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Daily growth" note="Views gained per day. Blue bars meet the breakout rule; grey bars are ordinary days. Days inside a gap between syncs are spread evenly (estimates) and can never be a breakout.">
          {growthRows.length === 0 ? <Empty>No data.</Empty> : <SeriesChart rows={growthRows} kind="stackedBar" series={[{ key: 'ordinary', name: 'Ordinary day', color: '#737373' }, { key: 'breakout', name: 'Breakout day', color: '#38bdf8' }]} />}
          {breakoutDays.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-sky-300">
              {breakoutDays.map((d) => (
                <li key={d.day}>
                  Breakout {d.day} · day {Math.round((Date.parse(`${d.day}T00:00:00Z`) - Date.parse(`${dayKey(v.publishedAt ?? now)}T00:00:00Z`)) / DAY_MS)} · +{fmtInt(Math.round(d.gain))} views
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-neutral-600">Real (non-estimated) days: {peakReal.length}. Reporting timezone: {REPORTING_TZ}.</p>
        </Card>
        <Card title="Lifetime views" note="Total views by date. Hollow dots are estimated days.">
          {lifetimeRows.length === 0 ? <Empty>No data.</Empty> : <SeriesChart rows={lifetimeRows} series={[{ key: 's0', name: 'Lifetime views', color: '#38bdf8' }]} />}
        </Card>
        <Card title="Against typical" note={`Lifetime views by days since posting, against this avatar's typical ${PLATFORM_DISPLAY_NAME[v.platform]} curve (median of its other videos at the same age, with the 25th–75th percentile band). A day is drawn only when at least 5 other videos have a reliable value for it.`}>
          {typicalDraw ? (
            <SeriesChart
              rows={typical.rows}
              series={[
                { key: 'video', name: 'This video', color: '#38bdf8' },
                { key: 'typical', name: 'Typical (median)', color: '#a3a3a3', dashed: true },
                { key: 'p25', name: '25th percentile', color: '#525252', dashed: true },
                { key: 'p75', name: '75th percentile', color: '#525252', dashed: true },
              ]}
              xIsDate={false}
            />
          ) : (
            <Locked title="Typical curve not available yet">{typical.peers} other videos from this avatar on this platform exist, but fewer than 5 have daily-sync history at each age. It fills in as the phone app syncs daily.</Locked>
          )}
        </Card>
        <Card title="Engagement over time" note="Likes, comments and shares gained per day, plus the engagement rate. Shows whether a late spike brought real engagement or only passive views.">
          {engRows.length < 2 ? (
            <Empty>Needs at least two syncs.</Empty>
          ) : (
            <SeriesChart rows={engRows} kind="stackedBar" series={[{ key: 'likes', name: 'Likes', color: '#f472b6' }, { key: 'comments', name: 'Comments', color: '#38bdf8' }, { key: 'shares', name: 'Shares', color: '#a3e635' }]} />
          )}
        </Card>
        <Card title={`Projection to day ${(ageDays === null ? 0 : Math.floor(ageDays)) + projHorizon}`} note="Estimate: this avatar's typical growth ratio from the same age, applied to this video's views. Dashed, with a 25th–75th percentile band.">
          {proj.available ? (
            <SeriesChart
              rows={proj.rows}
              xIsDate={false}
              series={[
                { key: 'proj', name: 'Projection (estimate)', color: '#a78bfa', dashed: true },
                { key: 'proj_lo', name: '25th percentile', color: '#6d28d9', dashed: true },
                { key: 'proj_hi', name: '75th percentile', color: '#6d28d9', dashed: true },
              ]}
            />
          ) : (
            <Locked title="Projection not available yet">{proj.reason}</Locked>
          )}
        </Card>
        <Card title="Other platforms" note="If this video was cross-posted (same avatar, posted within 24 hours, captions at least 80% similar), one line per platform by days since posting.">
          {siblings.length === 0 ? <Empty>No cross-posted copy found for this video.</Empty> : <SeriesChart rows={sibRows} series={sibSeries} xIsDate={false} />}
        </Card>
        <Card title="First 72 hours" note="Hourly views gained.">
          <Locked title="Hourly data is not collected">The optional hourly snapshot table needs a new database table, which is not set up yet.</Locked>
        </Card>
      </div>
    </div>
  )
}

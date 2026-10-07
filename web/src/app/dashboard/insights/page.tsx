import Link from 'next/link'
import { FilterBar } from '@/components/FilterBar'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { Sparkline } from '@/components/charts/Sparkline'
import { Badge, Card, DataSince, Empty, exportUrl, PageHeader } from '@/components/ui'
import { REPORTING_TZ, DAY_MS, type Filters } from '@/lib/filters'
import { fmtInt, fmtPct, fmtSigned } from '@/lib/format'
import { buildAlerts } from '@/lib/alerts'
import {
  computeTotals,
  engagementRates,
  followerStats,
  pctChange,
  staleConnections,
  type Totals,
} from '@/lib/metrics'
import { PLATFORM_DISPLAY_NAME, PLATFORM_FOLLOWER_LABEL } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import { buildSeries, dailyGains, firstSnapshotDay, listDays } from '@/lib/series'
import { buildVideoRows } from '@/lib/videos'

function Delta({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return <span className="text-xs text-neutral-600">{label === '' ? '' : 'no comparison'}</span>
  const up = pct >= 0
  return (
    <span className={`text-xs tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% {label ?? 'vs. comparison'}
    </span>
  )
}

function Tile({ title, value, children, note, spark }: { title: string; value: string; children?: React.ReactNode; note?: string; spark?: number[] }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-neutral-500">{title}</p>
        {spark && <Sparkline values={spark} color="#38bdf8" />}
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-100">{value}</p>
      <div className="mt-1 min-h-4">{children}</div>
      {note && <p className="mt-1 text-xs text-neutral-600">{note}</p>}
    </div>
  )
}

function fmtDate(ms: number): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: REPORTING_TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms))
}

function ago(ms: number | null, now: number): string {
  if (ms === null) return 'never'
  const h = Math.floor((now - ms) / 3600000)
  if (h < 1) return 'under an hour ago'
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const res = await tryScope(await searchParams)
  if (!res.sc) {
    return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load insights: {res.error}</div>
  }
  const { sc } = res
  const { filters, now, range, ds, avatars, videos, connections } = sc

  const cur = computeTotals(videos, range.current, filters.hitThreshold)
  const prev = range.previous ? computeTotals(videos, range.previous, filters.hitThreshold) : null
  const fCur = followerStats(connections, range.current)
  const fPrev = range.previous ? followerStats(connections, range.previous) : null

  const platformsWithData = new Set(videos.filter((v) => v.snaps.length > 0).map((v) => v.platform))
  const crossPlatform = platformsWithData.size > 1
  const rates = engagementRates(cur, filters.basis)
  const prevRates = prev ? engagementRates(prev, filters.basis) : null
  const engagement = crossPlatform ? rates.crossPlatformEngagement : rates.engagement
  const prevEngagement = prevRates ? (crossPlatform ? prevRates.crossPlatformEngagement : prevRates.engagement) : null

  const gained = filters.basis === 'gained'
  const viewsNow = gained ? cur.viewsGained : cur.postedViews
  const viewsPrev = prev ? (gained ? prev.viewsGained : prev.postedViews) : null
  const compareLabel = filters.compare === 'last_month' ? 'vs. last month' : 'vs. previous period'

  const stale = staleConnections(ds, now)
  const alerts = buildAlerts(ds, videos, filters, now).filter((a) => a.kind !== 'stale')

  // 30-day sparkline of views gained per day (whole current scope)
  const sparkWindow = { startMs: now - 30 * DAY_MS, endMs: now }
  const sparkDaily = dailyGains(videos, sparkWindow, 'views')
  const spark = listDays(sparkWindow).map((d) => Math.round(sparkDaily.get(d)?.value ?? 0))

  // Main trend: views gained per day, one line total, previous period dashed, spike markers.
  const trendFilters: Filters = { ...filters, metric: 'views', split: 'none', indexed: false }
  const trend = buildSeries({ filters: trendFilters, window: range.current, previous: range.previous, avatars, videos, conns: connections })
  const mixFilters: Filters = { ...filters, metric: 'views', split: 'platform', indexed: false }
  const mix = buildSeries({ filters: mixFilters, window: range.current, previous: null, avatars, videos, conns: connections })

  const rows = buildVideoRows(videos, range.current, filters, now)
  const rowById = new Map(rows.map((r) => [r.video.id, r]))
  const movers = rows
    .filter((r) => (gained ? r.gained > 0 : r.video.publishedAt !== null && r.video.publishedAt >= range.current.startMs && r.video.publishedAt <= range.current.endMs && r.lifetime !== null))
    .sort((a, b) => (gained ? b.gained - a.gained : (b.lifetime ?? 0) - (a.lifetime ?? 0)))
    .slice(0, 10)

  const avatarName = new Map(ds.avatars.map((a) => [a.id, a.name]))
  const weeks = Math.max(1 / 7, (range.current.endMs - range.current.startMs) / (7 * DAY_MS))

  const leaderboard = avatars
    .map((a) => {
      const vids = videos.filter((v) => v.avatarId === a.id)
      const conns = connections.filter((c) => c.avatarId === a.id)
      const t = computeTotals(vids, range.current, filters.hitThreshold)
      const tp = range.previous ? computeTotals(vids, range.previous, filters.hitThreshold) : null
      const fs = followerStats(conns, range.current)
      const views = gained ? t.viewsGained : t.postedViews
      const viewsBefore = tp ? (gained ? tp.viewsGained : tp.postedViews) : null
      const multi = new Set(vids.filter((v) => v.snaps.length > 0).map((v) => v.platform)).size > 1
      const r = engagementRates(t, filters.basis)
      const d = dailyGains(vids, sparkWindow, 'views')
      return {
        avatar: a,
        t,
        fs,
        views,
        change: pctChange(views, viewsBefore),
        engagement: multi ? r.crossPlatformEngagement : r.engagement,
        hasData: vids.length > 0 || conns.length > 0,
        spark: listDays(sparkWindow).map((day) => Math.round(d.get(day)?.value ?? 0)),
        perWeek: t.postedCount / weeks,
      }
    })
    .sort((x, y) => y.views - x.views)

  const since = sc.ds.firstSnapshotMs !== null ? firstSnapshotDay(sc.ds) : null

  return (
    <div>
      <PageHeader
        title="Insights"
        subtitle={`${range.label}${ds.firstSnapshotMs !== null ? ` · Data since ${fmtDate(ds.firstSnapshotMs)}` : ''}`}
      />

      {stale.length > 0 && (
        <div className="mb-5 rounded-lg border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
          <p className="font-medium">
            {stale.length} connected {stale.length === 1 ? 'account needs' : 'accounts need'} attention — numbers for them may be out of date.{' '}
            <Link href="/dashboard/health" className="underline">Open sync health</Link>
          </p>
          <ul className="mt-2 space-y-0.5 text-amber-300/90">
            {stale.map((s) => (
              <li key={s.connection.id}>
                {s.avatarName} · {PLATFORM_DISPLAY_NAME[s.connection.platform]} —{' '}
                {s.reason === 'needs_reconnect' ? 'sign-in expired, reconnect it on the phone app' : s.reason === 'never' ? 'never synced' : `last updated ${ago(s.lastSyncMs, now)}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilterBar action="/dashboard/insights" filters={filters} avatarOptions={ds.avatars} platformOptions={sc.platformOptions} />

      {alerts.length > 0 && (
        <Card title="Alerts" className="mb-6" note="Breakouts in the last 2 days, follower drops, and videos stuck at 0 views. Slack/email delivery is not set up.">
          <ul className="space-y-1.5 text-sm">
            {alerts.slice(0, 8).map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <Badge tone={a.kind === 'breakout' ? 'blue' : a.kind === 'zero_views' ? 'amber' : 'red'}>{a.kind.replace('_', ' ')}</Badge>
                {a.href ? <Link href={a.href} className="text-neutral-200 hover:underline">{a.title}</Link> : <span className="text-neutral-200">{a.title}</span>}
                <span className="text-xs text-neutral-500">{a.detail}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          title={gained ? 'Views gained' : 'Views on videos posted in period'}
          value={fmtInt(viewsNow)}
          spark={spark}
          note={gained && cur.partialVideos > 0 ? `${fmtInt(cur.partialVideos)} videos have limited history, so day-level numbers for them are estimates.` : undefined}
        >
          <Delta pct={pctChange(viewsNow, viewsPrev)} label={compareLabel} />
        </Tile>
        <Tile title="Followers gained (net)" value={fCur.gained === null ? '—' : fmtSigned(fCur.gained)} note={fCur.partial ? 'Limited follower history in this range.' : undefined}>
          {fPrev?.gained !== null && fPrev?.gained !== undefined && fCur.gained !== null ? (
            <span className="text-xs tabular-nums text-neutral-500">
              {fmtSigned(fPrev.gained)} {filters.compare === 'last_month' ? 'last month' : 'previous period'}
            </span>
          ) : null}
        </Tile>
        <Tile
          title="Follower growth"
          value={fCur.growthPct === null ? (fCur.gained === null ? '—' : `${fmtSigned(fCur.gained)} net`) : fmtPct(fCur.growthPct)}
          note={fCur.growthPct === null && fCur.gained !== null ? 'Under 100 followers at start, so net count is shown instead of %.' : undefined}
        >
          <span className="text-xs text-neutral-600">{fCur.current === null ? '' : `${fmtInt(fCur.current)} total now`}</span>
        </Tile>
        <Tile
          title={crossPlatform ? 'Engagement rate (likes + comments)' : 'Engagement rate'}
          value={fmtPct(engagement)}
          note={crossPlatform ? 'More than one platform is included, so shares and saves are left out (YouTube reports none).' : undefined}
        >
          <Delta pct={pctChange(engagement, prevEngagement)} label={compareLabel} />
        </Tile>
        <Tile title="Videos posted" value={fmtInt(cur.postedCount)}>
          <Delta pct={prev ? pctChange(cur.postedCount, prev.postedCount) : null} label={compareLabel} />
        </Tile>
        <Tile
          title={`Hits (≥ ${fmtInt(filters.hitThreshold)} views)`}
          value={fmtInt(cur.hits)}
          note={cur.typicalViews !== null ? `Typical video: ${fmtInt(Math.round(cur.typicalViews))} views (median).` : undefined}
        >
          <span className="text-xs text-neutral-500">{cur.hitRate === null ? 'no videos posted' : `${fmtPct(cur.hitRate, 1)} hit rate`}</span>
        </Tile>
      </div>
      <p className="mb-6 text-xs text-neutral-600">
        {gained
          ? 'Views gained = growth in views over the range from saved sync snapshots, for every video of any age.'
          : 'Views on videos posted in the range = their latest total views.'}{' '}
        Numbers are exact.
      </p>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card
          title="Views gained per day"
          note="Orange dots mark spike days (≥ 3× the previous 28-day median) with the video that caused them. Dashed grey = previous period."
          exportHref={exportUrl('timeseries', { ...filters, metric: 'views', split: 'none' })}
        >
          {trend.empty ? <Empty>No view history in this range yet.</Empty> : <SeriesChart rows={trend.rows} series={trend.series} spikes={trend.spikes} />}
          <DataSince since={since} />
          {trend.spikes.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber-300/90">
              {trend.spikes.slice(0, 5).map((s, i) => (
                <li key={i}>Spike {s.x}: {s.label}</li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Mix over time" note="Share of views gained by platform (100% stacked).">
          {mix.empty ? <Empty>No view history in this range yet.</Empty> : <SeriesChart rows={mix.rows} series={mix.series} kind="stackedPct" yFormat="percent" />}
          <DataSince since={since} estimated={false} />
        </Card>
      </div>

      <Card title="Leaderboard" className="mb-6" exportHref={exportUrl('leaderboard', filters)}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">Avatar</th>
                <th className="px-3 py-2 text-right font-medium">{gained ? 'Views gained' : 'Views (posted)'}</th>
                <th className="px-3 py-2 text-right font-medium">Change</th>
                <th className="px-3 py-2 font-medium">30 days</th>
                <th className="px-3 py-2 text-right font-medium">Followers</th>
                <th className="px-3 py-2 text-right font-medium">Followers gained</th>
                <th className="px-3 py-2 text-right font-medium">Engagement</th>
                <th className="px-3 py-2 text-right font-medium">Typical views</th>
                <th className="px-3 py-2 text-right font-medium">Hit rate</th>
                <th className="px-3 py-2 text-right font-medium">Posts / week</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {leaderboard.map((r) => (
                <tr key={r.avatar.id} className={r.hasData ? undefined : 'text-neutral-600'}>
                  <td className="px-3 py-2.5">
                    <Link href={`/dashboard/avatars/${r.avatar.id}`} className="font-medium hover:underline">
                      {r.avatar.name}
                    </Link>
                    {!r.hasData && <span className="ml-2 text-xs">no connected accounts</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.views)}</td>
                  <td className="px-3 py-2.5 text-right"><Delta pct={r.change} label="" /></td>
                  <td className="px-3 py-2.5"><Sparkline values={r.spark} color="#38bdf8" /></td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.fs.current)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtSigned(r.fs.gained)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(r.engagement)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.t.typicalViews === null ? '—' : fmtInt(Math.round(r.t.typicalViews))}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(r.t.hitRate, 1)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{r.perWeek.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title={gained ? 'Top movers — most views gained in range, any age' : 'Top videos posted in range'} className="mb-6" exportHref={exportUrl('movers', filters)}>
        {movers.length === 0 ? (
          <Empty>No videos with view gains in this range.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Video</th>
                  <th className="px-3 py-2 font-medium">Avatar</th>
                  <th className="px-3 py-2 font-medium">Platform</th>
                  <th className="px-3 py-2 font-medium">Posted</th>
                  <th className="px-3 py-2 text-right font-medium">{gained ? 'Views gained' : 'Views'}</th>
                  <th className="px-3 py-2 text-right font-medium">Lifetime</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {movers.map((m) => {
                  const r = rowById.get(m.video.id)!
                  return (
                    <tr key={m.video.id}>
                      <td className="max-w-md px-3 py-2.5">
                        <Link href={`/dashboard/videos/${m.video.id}`} className="line-clamp-2 text-neutral-200 hover:underline">
                          {m.video.title ?? '(untitled)'}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-400">{avatarName.get(m.video.avatarId)}</td>
                      <td className="px-3 py-2.5 text-neutral-400">{PLATFORM_DISPLAY_NAME[m.video.platform]}</td>
                      <td className="px-3 py-2.5 text-neutral-400">{m.video.publishedAt ? fmtDate(m.video.publishedAt) : '—'}</td>
                      <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                        {fmtInt(gained ? r.gained : r.lifetime)}
                        {gained && r.gainedPartial && <span className="ml-1 text-xs text-neutral-600" title="Partly estimated">~</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{fmtInt(r.lifetime)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {r.status && <Badge>{r.status}</Badge>}
                          {r.breakout && <Badge tone="blue">Breakout</Badge>}
                          {r.lateBreakout && <Badge tone="amber">Late breakout</Badge>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <h2 className="mb-3 text-sm font-medium text-neutral-400">Per avatar and platform</h2>
      <div className="space-y-8">
        {avatars.map((avatar) => {
          const vids = videos.filter((v) => v.avatarId === avatar.id)
          const conns = connections.filter((c) => c.avatarId === avatar.id)
          const platforms = Array.from(new Set(conns.map((c) => c.platform)))
          return (
            <div key={avatar.id}>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/avatars/${avatar.id}`} className="text-base font-semibold hover:underline">
                  {avatar.name}
                </Link>
                {conns.map((c) => {
                  const f = followerStats([c], range.current)
                  return (
                    <Link
                      key={c.id}
                      href={`/dashboard/avatars/${avatar.id}?platform=${c.platform}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950/60 px-2.5 py-1 text-sm transition hover:border-neutral-600"
                    >
                      <span className="text-neutral-400">{PLATFORM_DISPLAY_NAME[c.platform]}</span>
                      <span className="font-semibold tabular-nums text-neutral-100">{fmtInt(f.current)}</span>
                      <span className="text-xs text-neutral-500">{PLATFORM_FOLLOWER_LABEL[c.platform]}</span>
                    </Link>
                  )
                })}
              </div>
              {platforms.length === 0 ? (
                <p className="text-sm text-neutral-600">No connected accounts. Connect one on the phone app, or leave this avatar out of comparisons.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-neutral-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-900 text-neutral-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Platform</th>
                        <th className="px-3 py-2 text-right font-medium">Videos posted</th>
                        <th className="px-3 py-2 text-right font-medium">{gained ? 'Views gained' : 'Views (posted)'}</th>
                        <th className="px-3 py-2 text-right font-medium">Likes</th>
                        <th className="px-3 py-2 text-right font-medium">Comments</th>
                        <th className="px-3 py-2 text-right font-medium">Shares</th>
                        <th className="px-3 py-2 text-right font-medium">Saves</th>
                        <th className="px-3 py-2 text-right font-medium">Engagement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {platforms.map((p) => {
                        const t: Totals = computeTotals(vids.filter((v) => v.platform === p), range.current, filters.hitThreshold)
                        const r = engagementRates(t, filters.basis)
                        // YouTube's API reports no shares or saves; show a dash, not a misleading 0.
                        const noShares = p === 'youtube'
                        return (
                          <tr key={p}>
                            <td className="px-3 py-2.5 text-neutral-300">{PLATFORM_DISPLAY_NAME[p]}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">{fmtInt(t.postedCount)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(gained ? t.viewsGained : t.postedViews)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(gained ? t.likesGained : t.postedLikes)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(gained ? t.commentsGained : t.postedComments)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{noShares ? '—' : fmtInt(gained ? t.sharesGained : t.postedShares)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{noShares ? '—' : fmtInt(gained ? t.savesGained : t.postedSaves)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(r.engagement)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

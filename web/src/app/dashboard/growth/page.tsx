import Link from 'next/link'
import { FilterBar } from '@/components/FilterBar'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { Card, DataSince, Empty, exportUrl, Locked, PageHeader } from '@/components/ui'
import { DAY_MS, type Filters } from '@/lib/filters'
import { fmtInt, fmtSigned } from '@/lib/format'
import { computeTotals, followerStats } from '@/lib/metrics'
import { MIN_HISTORY_DAYS, milestoneEta } from '@/lib/projection'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import {
  addDays,
  avatarColor,
  buildSeries,
  dayKey,
  firstSnapshotDay,
  followerDaily,
  realReadingDays,
  type Group,
} from '@/lib/series'

export default async function GrowthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const res = await tryScope(await searchParams)
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { filters, range, avatars, videos, connections, ds, now } = sc
  const since = firstSnapshotDay(ds)
  const avatarName = new Map(ds.avatars.map((a) => [a.id, a.name]))

  // One line per connected account.
  const accountGroups: Group[] = connections.map((c) => ({
    key: c.id,
    name: `${avatarName.get(c.avatarId) ?? '?'} · ${PLATFORM_DISPLAY_NAME[c.platform]}`,
    color: avatarColor(ds.avatars, c.avatarId),
    videos: [],
    conns: [c],
  }))
  const base: Omit<Filters, 'metric'> = filters
  const followersChart = buildSeries({ filters: { ...base, metric: 'followers', indexed: false }, window: range.current, previous: null, avatars, videos, conns: connections, groups: accountGroups })
  const indexedChart = buildSeries({ filters: { ...base, metric: 'followers', indexed: true }, window: range.current, previous: null, avatars, videos, conns: connections, groups: accountGroups })
  const netChart = buildSeries({ filters: { ...base, metric: 'net_followers', split: 'avatar', indexed: false, granularity: 'daily' }, window: range.current, previous: null, avatars, videos, conns: connections })

  // Weekly growth rate per avatar (% change in followers week over week).
  const weeklyFollowers = buildSeries({ filters: { ...base, metric: 'followers', split: 'avatar', indexed: false, granularity: 'weekly' }, window: range.current, previous: null, avatars, videos, conns: connections })
  const rateRows = weeklyFollowers.rows.map((row, i, all) => {
    const out: Record<string, number | string | null> = { x: row.x as string }
    weeklyFollowers.series.forEach((s) => {
      const prev = i > 0 ? all[i - 1][s.key] : null
      const cur = row[s.key]
      out[s.key] = typeof prev === 'number' && typeof cur === 'number' && prev >= 100 ? ((cur - prev) / prev) * 100 : null
    })
    return out
  })

  // Followers per 1K views, per avatar, over the selected range.
  const perK = avatars
    .map((a) => {
      const vids = videos.filter((v) => v.avatarId === a.id)
      const fs = followerStats(connections.filter((c) => c.avatarId === a.id), range.current)
      const t = computeTotals(vids, range.current, filters.hitThreshold)
      const value = fs.gained !== null && t.viewsGained > 0 ? (fs.gained / t.viewsGained) * 1000 : null
      return { avatar: a, value, gained: fs.gained, views: t.viewsGained }
    })
    .filter((r) => r.value !== null)
  const perKData = {
    rows: perK.map((r) => ({ x: r.avatar.name, v: Math.round((r.value as number) * 100) / 100 })),
    series: [{ key: 'v', name: 'Followers per 1K views', color: '#34d399' }],
  }

  // Milestone ETA needs 28 days of history.
  const eta = avatars.map((a) => {
    const conns = connections.filter((c) => c.avatarId === a.id)
    const real = realReadingDays(conns, now, 28)
    const w = { startMs: now - 28 * DAY_MS, endMs: now }
    const daily = followerDaily(conns, w)
    const days = Array.from(daily.keys()).sort()
    const first = daily.get(days[0])
    const last = daily.get(days[days.length - 1])
    const current = last?.value ?? null
    const perDay = first && last && days.length > 1 ? (last.value - first.value) / (days.length - 1) : null
    return { a, real, current, perDay, ready: real >= 28 }
  })

  return (
    <div>
      <PageHeader title="Growth" subtitle={`Followers and subscribers · ${range.label}`} />
      <FilterBar action="/dashboard/growth" filters={filters} avatarOptions={ds.avatars} platformOptions={sc.platformOptions} show={{ content: false, basis: false }} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Followers over time" note="One line per account. Follower or subscriber count by day." exportHref={exportUrl('followers', filters)}>
          {followersChart.empty ? <Empty>No follower history in this range.</Empty> : <SeriesChart rows={followersChart.rows} series={followersChart.series} kind="line" log={filters.log} />}
          <DataSince since={since} />
          <p className="mt-1 text-xs text-neutral-600">
            For a projection, open the <Link className="underline" href={`/dashboard/trends?metric=followers&split=none&proj=30`}>trend explorer with a 30-day projection</Link>. YouTube history before the first sync is not backfilled (needs the YouTube Analytics API).
          </p>
        </Card>
        <Card title="Indexed growth" note="Every account starts at 100, so small and large accounts compare fairly.">
          {indexedChart.empty ? <Empty>No follower history in this range.</Empty> : <SeriesChart rows={indexedChart.rows} series={indexedChart.series} kind="line" />}
        </Card>
        <Card title="Daily net followers" note="Followers gained or lost per day, per avatar. Days with no sync are estimates, spread across the gap; a gap is never drawn as zero.">
          {netChart.empty ? <Empty>Needs at least two days of follower readings.</Empty> : <SeriesChart rows={netChart.rows} series={netChart.series} kind="bar" />}
        </Card>
        <Card title="Growth rate (week over week)" note="Follower growth % per week. Accounts under 100 followers are left out, because % swings wildly there; use the net chart instead.">
          {rateRows.every((r) => Object.entries(r).every(([k, v]) => k === 'x' || v === null)) ? (
            <Empty>Needs two weeks of follower history (or an account with at least 100 followers).</Empty>
          ) : (
            <SeriesChart rows={rateRows} series={weeklyFollowers.series} kind="line" yFormat="percent" />
          )}
        </Card>
        <Card title="Followers per 1K views" note="Followers gained divided by views gained, ×1,000: which avatar turns views into followers.">
          {perK.length === 0 ? <Empty>Needs follower and view history in the same range.</Empty> : <SeriesChart rows={perKData.rows} series={perKData.series} kind="bar" xIsDate={false} />}
        </Card>
        <Card title="Milestone ETA and goal line" note="Next round milestone and the date it is reached at the current rate. Needs 28 days of daily syncs.">
          <ul className="space-y-2 text-sm">
            {eta.map((e) => {
              if (!e.ready || e.current === null || e.perDay === null) {
                const unlock = addDays(dayKey(now), Math.max(0, 28 - e.real))
                return (
                  <li key={e.a.id}>
                    <span className="text-neutral-300">{e.a.name}</span>
                    <span className="ml-2 text-xs text-neutral-500">available from about {unlock} ({e.real} of 28 sync days so far)</span>
                  </li>
                )
              }
              const m = milestoneEta(e.current, e.perDay)
              const date = m && m.days !== null ? addDays(dayKey(now), m.days) : null
              return (
                <li key={e.a.id}>
                  <span className="text-neutral-300">{e.a.name}</span>{' '}
                  <span className="text-neutral-400">
                    {m ? (date ? `${fmtInt(m.milestone)} followers around ${date} at the current rate (${fmtSigned(Math.round(e.perDay * 10) / 10)}/day)` : `no growth, so ${fmtInt(m.milestone)} is not reached at the current rate`) : 'past every milestone'}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="mt-3">
            <Locked title="Goals">Per-avatar goals (for example 10,000 followers by Dec 31) need a place to store them in the database, which is not set up yet.</Locked>
          </div>
          <p className="mt-2 text-xs text-neutral-600">Minimum history for projections: {MIN_HISTORY_DAYS} days.</p>
        </Card>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { FilterBar } from '@/components/FilterBar'
import { nowMs, parseFilters, resolveRange, REPORTING_TZ, type Filters } from '@/lib/filters'
import { fmtInt, fmtPct, fmtSigned } from '@/lib/format'
import {
  computeTotals,
  engagementRates,
  followerStats,
  loadDataset,
  pctChange,
  staleConnections,
  topMovers,
  type Dataset,
  type Totals,
} from '@/lib/metrics'
import { PLATFORM_DISPLAY_NAME, PLATFORM_FOLLOWER_LABEL, SUPPORTED_PLATFORMS } from '@/lib/platforms'
import type { PlatformName } from '@/types/database'

function Delta({ pct, label }: { pct: number | null; label?: string }) {
  if (pct === null) return <span className="text-xs text-neutral-600">{label ?? 'no comparison'}</span>
  const up = pct >= 0
  return (
    <span className={`text-xs tabular-nums ${up ? 'text-green-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}% {label ?? 'vs. comparison'}
    </span>
  )
}

function Tile({ title, value, children, note }: { title: string; value: string; children?: React.ReactNode; note?: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-medium text-neutral-500">{title}</p>
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

function pick(ds: Dataset, f: Filters) {
  const avatarOk = (id: string) => f.avatars.length === 0 || f.avatars.includes(id)
  const platformOk = (p: PlatformName) => f.platforms.length === 0 || f.platforms.includes(p)
  return {
    avatars: ds.avatars.filter((a) => avatarOk(a.id)),
    videos: ds.videos.filter((v) => avatarOk(v.avatarId) && platformOk(v.platform)),
    connections: ds.connections.filter((c) => avatarOk(c.avatarId) && platformOk(c.platform)),
  }
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filters = parseFilters(await searchParams)
  const now = nowMs()
  const range = resolveRange(filters, now)

  const supabase = await createClient()
  let ds: Dataset
  try {
    ds = await loadDataset(supabase)
  } catch (e) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">
        Failed to load insights: {e instanceof Error ? e.message : 'unknown error'}
      </div>
    )
  }

  const scoped = pick(ds, filters)
  const connectedPlatforms = Array.from(new Set(ds.connections.map((c) => c.platform)))
  const platformOptions = SUPPORTED_PLATFORMS.filter((p) => connectedPlatforms.includes(p))
    .concat(connectedPlatforms.filter((p) => !SUPPORTED_PLATFORMS.includes(p)))

  const cur = computeTotals(scoped.videos, range.current, filters.hitThreshold)
  const prev = range.previous ? computeTotals(scoped.videos, range.previous, filters.hitThreshold) : null
  const fCur = followerStats(scoped.connections, range.current)
  const fPrev = range.previous ? followerStats(scoped.connections, range.previous) : null

  const platformsWithData = new Set(scoped.videos.filter((v) => v.snaps.length > 0).map((v) => v.platform))
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
  const movers = topMovers(scoped.videos, range.current, filters.basis, 10)

  const leaderboard = scoped.avatars
    .map((a) => {
      const vids = scoped.videos.filter((v) => v.avatarId === a.id)
      const conns = scoped.connections.filter((c) => c.avatarId === a.id)
      const t = computeTotals(vids, range.current, filters.hitThreshold)
      const tp = range.previous ? computeTotals(vids, range.previous, filters.hitThreshold) : null
      const fs = followerStats(conns, range.current)
      const views = gained ? t.viewsGained : t.postedViews
      const viewsBefore = tp ? (gained ? tp.viewsGained : tp.postedViews) : null
      const multi = new Set(vids.filter((v) => v.snaps.length > 0).map((v) => v.platform)).size > 1
      const r = engagementRates(t, filters.basis)
      return {
        avatar: a,
        t,
        fs,
        views,
        change: pctChange(views, viewsBefore),
        engagement: multi ? r.crossPlatformEngagement : r.engagement,
        hasData: vids.length > 0 || conns.length > 0,
      }
    })
    .sort((x, y) => y.views - x.views)

  const avatarName = new Map(ds.avatars.map((a) => [a.id, a.name]))

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Insights</h1>
      <p className="mb-5 text-sm text-neutral-500">
        {range.label}
        {ds.firstSnapshotMs !== null && <> · Data since {fmtDate(ds.firstSnapshotMs)}</>}
      </p>

      {stale.length > 0 && (
        <div className="mb-5 rounded-lg border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
          <p className="font-medium">
            {stale.length} connected {stale.length === 1 ? 'account needs' : 'accounts need'} attention — numbers for them may be out of date.
          </p>
          <ul className="mt-2 space-y-0.5 text-amber-300/90">
            {stale.map((s) => (
              <li key={s.connection.id}>
                {s.avatarName} · {PLATFORM_DISPLAY_NAME[s.connection.platform]} —{' '}
                {s.reason === 'needs_reconnect'
                  ? 'sign-in expired, reconnect it on the phone app'
                  : s.reason === 'never'
                    ? 'never synced'
                    : `last updated ${ago(s.lastSyncMs, now)}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <FilterBar
        action="/dashboard/insights"
        filters={filters}
        avatarOptions={ds.avatars}
        platformOptions={platformOptions}
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          title={gained ? 'Views gained' : 'Views on videos posted in period'}
          value={fmtInt(viewsNow)}
          note={gained && cur.partialVideos > 0 ? `${fmtInt(cur.partialVideos)} videos have limited history, so their gains are underestimates.` : undefined}
        >
          <Delta pct={pctChange(viewsNow, viewsPrev)} label={compareLabel} />
        </Tile>
        <Tile
          title="Followers gained (net)"
          value={fCur.gained === null ? '—' : fmtSigned(fCur.gained)}
          note={fCur.partial ? 'Limited follower history in this range.' : undefined}
        >
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
      <p className="mb-8 text-xs text-neutral-600">
        {gained
          ? 'Views gained = views at the end of the range minus views at the start, from saved sync snapshots, for every video of any age.'
          : 'Views on videos posted in the range = their latest total views.'}{' '}
        Numbers are exact. History builds as the phone app syncs.
      </p>

      <h2 className="mb-3 text-sm font-medium text-neutral-400">Leaderboard</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-neutral-900 text-neutral-400">
            <tr>
              <th className="px-3 py-2 font-medium">Avatar</th>
              <th className="px-3 py-2 text-right font-medium">{gained ? 'Views gained' : 'Views (posted)'}</th>
              <th className="px-3 py-2 text-right font-medium">Change</th>
              <th className="px-3 py-2 text-right font-medium">Followers</th>
              <th className="px-3 py-2 text-right font-medium">Followers gained</th>
              <th className="px-3 py-2 text-right font-medium">Engagement</th>
              <th className="px-3 py-2 text-right font-medium">Typical views</th>
              <th className="px-3 py-2 text-right font-medium">Hit rate</th>
              <th className="px-3 py-2 text-right font-medium">Posts</th>
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
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.fs.current)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtSigned(r.fs.gained)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(r.engagement)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.t.typicalViews === null ? '—' : fmtInt(Math.round(r.t.typicalViews))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(r.t.hitRate, 1)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.t.postedCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-3 text-sm font-medium text-neutral-400">
        {gained ? 'Top movers — most views gained in range, any age' : 'Top videos posted in range'}
      </h2>
      {movers.length === 0 ? (
        <p className="mb-8 text-sm text-neutral-600">No videos with view gains in this range.</p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">Video</th>
                <th className="px-3 py-2 font-medium">Avatar</th>
                <th className="px-3 py-2 font-medium">Platform</th>
                <th className="px-3 py-2 font-medium">Posted</th>
                <th className="px-3 py-2 text-right font-medium">{gained ? 'Views gained' : 'Views'}</th>
                <th className="px-3 py-2 text-right font-medium">Lifetime views</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {movers.map((m) => (
                <tr key={m.video.id}>
                  <td className="max-w-md px-3 py-2.5">
                    <span className="line-clamp-2 text-neutral-200">{m.video.title ?? '(untitled)'}</span>
                    {m.video.url && (
                      <a href={m.video.url} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-500 hover:text-neutral-300">
                        Watch ↗
                      </a>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-neutral-400">{avatarName.get(m.video.avatarId)}</td>
                  <td className="px-3 py-2.5 text-neutral-400">{PLATFORM_DISPLAY_NAME[m.video.platform]}</td>
                  <td className="px-3 py-2.5 text-neutral-400">{m.video.publishedAt ? fmtDate(m.video.publishedAt) : '—'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-medium">
                    {fmtInt(m.gained)}
                    {m.partial && <span className="ml-1 text-xs text-neutral-600" title="Limited history: at least this many">+</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{fmtInt(m.lifetime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 text-sm font-medium text-neutral-400">Per avatar and platform</h2>
      <div className="space-y-8">
        {scoped.avatars.map((avatar) => {
          const vids = scoped.videos.filter((v) => v.avatarId === avatar.id)
          const conns = scoped.connections.filter((c) => c.avatarId === avatar.id)
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
                <p className="text-sm text-neutral-600">No connected accounts.</p>
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

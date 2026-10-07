import Link from 'next/link'
import { Badge, Card, Empty, PageHeader } from '@/components/ui'
import { DAY_MS } from '@/lib/filters'
import { fmtInt, fmtPct, fmtSigned } from '@/lib/format'
import { computeTotals, followerStats, pctChange } from '@/lib/metrics'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import { buildVideoRows } from '@/lib/videos'

// The Monday digest, shown on the dashboard. Emailing or posting it to Slack needs a delivery
// channel and your confirmation, so it is a page rather than a scheduled message.
export default async function DigestPage() {
  const res = await tryScope({ range: '7d' })
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { filters, ds, now } = sc
  const cur = { startMs: now - 7 * DAY_MS, endMs: now }
  const prev = { startMs: now - 14 * DAY_MS, endMs: now - 7 * DAY_MS }
  const rows = buildVideoRows(ds.videos, cur, filters, now)
  const name = new Map(ds.avatars.map((a) => [a.id, a.name]))

  const top = [...rows].filter((r) => r.gained > 0).sort((a, b) => b.gained - a.gained).slice(0, 5)
  const perAvatar = ds.avatars
    .map((a) => {
      const vids = ds.videos.filter((v) => v.avatarId === a.id)
      const conns = ds.connections.filter((c) => c.avatarId === a.id)
      const t = computeTotals(vids, cur, filters.hitThreshold)
      const p = computeTotals(vids, prev, filters.hitThreshold)
      return { a, views: t.viewsGained, change: pctChange(t.viewsGained, p.viewsGained), followers: followerStats(conns, cur), posted: t.postedCount }
    })
    .sort((x, y) => y.views - x.views)
  const movers = [...perAvatar].filter((r) => r.change !== null).sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0)).slice(0, 3)

  return (
    <div>
      <PageHeader title="Weekly digest" subtitle="The last 7 days compared with the 7 days before: top videos, biggest movers and growth per avatar." />
      <div className="grid gap-4">
        <Card title="Top videos this week" note="Most views gained in the last 7 days, any age.">
          {top.length === 0 ? (
            <Empty>No view gains recorded this week yet.</Empty>
          ) : (
            <ol className="space-y-2 text-sm">
              {top.map((r, i) => (
                <li key={r.video.id} className="flex flex-wrap items-center gap-2">
                  <span className="w-5 text-neutral-500">{i + 1}.</span>
                  <Link href={`/dashboard/videos/${r.video.id}`} className="max-w-xl truncate text-neutral-200 hover:underline">
                    {r.video.title ?? '(untitled)'}
                  </Link>
                  <span className="text-xs text-neutral-500">
                    {name.get(r.video.avatarId)} · {PLATFORM_DISPLAY_NAME[r.video.platform]}
                  </span>
                  <span className="tabular-nums text-neutral-300">+{fmtInt(r.gained)}</span>
                  {r.breakout && <Badge tone="blue">Breakout</Badge>}
                  {r.lateBreakout && <Badge tone="amber">Late breakout</Badge>}
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title="Biggest movers" note="Avatars whose views gained changed the most versus the previous week.">
          {movers.length === 0 ? (
            <Empty>Needs two weeks of history to compare.</Empty>
          ) : (
            <ul className="space-y-1 text-sm">
              {movers.map((m) => (
                <li key={m.a.id}>
                  <span className="text-neutral-200">{m.a.name}</span>{' '}
                  <span className={(m.change ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {(m.change ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(m.change ?? 0).toFixed(0)}%
                  </span>{' '}
                  <span className="text-xs text-neutral-500">{fmtInt(m.views)} views gained</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Growth per avatar" note="Brand totals need brands stored in the database, which is not set up yet, so this is per avatar.">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Avatar</th>
                  <th className="px-3 py-2 text-right font-medium">Views gained</th>
                  <th className="px-3 py-2 text-right font-medium">Change</th>
                  <th className="px-3 py-2 text-right font-medium">Followers</th>
                  <th className="px-3 py-2 text-right font-medium">Followers gained</th>
                  <th className="px-3 py-2 text-right font-medium">Growth</th>
                  <th className="px-3 py-2 text-right font-medium">Posts</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {perAvatar.map((r) => (
                  <tr key={r.a.id}>
                    <td className="px-3 py-2.5">
                      <Link href={`/dashboard/avatars/${r.a.id}`} className="hover:underline">{r.a.name}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.views)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.change === null ? '—' : `${r.change >= 0 ? '+' : ''}${r.change.toFixed(0)}%`}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(r.followers.current)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{fmtSigned(r.followers.gained)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.followers.growthPct === null ? '—' : fmtPct(r.followers.growthPct, 1)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{r.posted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  )
}

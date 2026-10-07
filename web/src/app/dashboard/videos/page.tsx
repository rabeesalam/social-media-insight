import Link from 'next/link'
import { FilterBar } from '@/components/FilterBar'
import { Sparkline } from '@/components/charts/Sparkline'
import { Badge, Card, Empty, exportUrl, PageHeader } from '@/components/ui'
import { REPORTING_TZ } from '@/lib/filters'
import { fmtInt, fmtPct } from '@/lib/format'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import { buildVideoRows, type VideoRow } from '@/lib/videos'

const PAGE_SIZE = 50

type SortKey = 'gained' | 'lifetime' | 'velocity' | 'age' | 'posted' | 'engagement' | 'peak'
const SORTS: { key: SortKey; label: string; get: (r: VideoRow) => number }[] = [
  { key: 'gained', label: 'Views gained', get: (r) => r.gained },
  { key: 'lifetime', label: 'Lifetime views', get: (r) => r.lifetime ?? -1 },
  { key: 'velocity', label: 'Velocity (24 h)', get: (r) => r.velocity24h },
  { key: 'age', label: 'Age (days)', get: (r) => r.ageDays ?? -1 },
  { key: 'posted', label: 'Posted', get: (r) => r.video.publishedAt ?? 0 },
  { key: 'engagement', label: 'Engagement', get: (r) => r.engagement ?? -1 },
  { key: 'peak', label: 'Days to peak', get: (r) => r.daysToPeak ?? -1 },
]

function fmtDate(ms: number | null): string {
  return ms === null ? '—' : new Intl.DateTimeFormat('en-US', { timeZone: REPORTING_TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms))
}

export default async function VideosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const one = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as string[])[0] : (raw[k] as string | undefined))
  const sortKey = (SORTS.find((s) => s.key === one('sort'))?.key ?? 'gained') as SortKey
  const dir = one('dir') === 'asc' ? 'asc' : 'desc'
  const page = Math.max(1, Number(one('page')) || 1)

  const res = await tryScope(raw)
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { filters, range, videos, ds, now } = sc

  const sort = SORTS.find((s) => s.key === sortKey)!
  const rows = buildVideoRows(videos, range.current, filters, now).sort((a, b) => (dir === 'asc' ? 1 : -1) * (sort.get(a) - sort.get(b)))
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const slice = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const avatarName = new Map(ds.avatars.map((a) => [a.id, a.name]))

  const base = new URLSearchParams()
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || ['sort', 'dir', 'page'].includes(k)) continue
    for (const x of Array.isArray(v) ? v : [v]) base.append(k, x)
  }
  const href = (patch: Record<string, string>) => {
    const q = new URLSearchParams(base)
    for (const [k, v] of Object.entries(patch)) q.set(k, v)
    return `/dashboard/videos?${q.toString()}`
  }

  const hasSaves = rows.some((r) => r.video.snaps.some((s) => s.saves !== null && s.saves > 0))

  return (
    <div>
      <PageHeader title="Videos" subtitle={`${fmtInt(rows.length)} videos · sorted by ${sort.label.toLowerCase()} · ${range.label}`} />
      <FilterBar action="/dashboard/videos" filters={filters} avatarOptions={ds.avatars} platformOptions={sc.platformOptions} show={{ basis: false }} />

      <Card
        title="Video table"
        note="Default sort is views gained in the period, so an old video that goes viral rises to the top. Click a title for its day-by-day drill-down. Tick up to 5 videos and compare their growth curves."
        exportHref={exportUrl('videos', filters)}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-neutral-500">Sort by</span>
          {SORTS.map((s) => (
            <Link key={s.key} href={href({ sort: s.key, dir: s.key === sortKey && dir === 'desc' ? 'asc' : 'desc' })} className={`rounded-md border px-2 py-0.5 ${s.key === sortKey ? 'border-neutral-300 text-neutral-100' : 'border-neutral-700 text-neutral-400 hover:border-neutral-500'}`}>
              {s.label}
              {s.key === sortKey ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </Link>
          ))}
        </div>
        {slice.length === 0 ? (
          <Empty>No videos match these filters.</Empty>
        ) : (
          <form method="get" action="/dashboard/videos/compare">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="px-2 py-2" />
                    <th className="px-3 py-2 font-medium">Video</th>
                    <th className="px-3 py-2 font-medium">Avatar</th>
                    <th className="px-3 py-2 font-medium">Platform</th>
                    <th className="px-3 py-2 font-medium">Posted</th>
                    <th className="px-3 py-2 text-right font-medium">Age</th>
                    <th className="px-3 py-2 text-right font-medium">Lifetime views</th>
                    <th className="px-3 py-2 text-right font-medium">Gained</th>
                    <th className="px-3 py-2 text-right font-medium">24 h</th>
                    <th className="px-3 py-2 text-right font-medium">To peak</th>
                    <th className="px-3 py-2 font-medium">14 days</th>
                    <th className="px-3 py-2 text-right font-medium">Engagement</th>
                    {hasSaves && <th className="px-3 py-2 text-right font-medium">Saves</th>}
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {slice.map((r) => {
                    const last = r.video.snaps[r.video.snaps.length - 1]
                    return (
                      <tr key={r.video.id} className="hover:bg-neutral-900/60">
                        <td className="px-2 py-2.5">
                          <input type="checkbox" name="id" value={r.video.id} aria-label="Select to compare" />
                        </td>
                        <td className="max-w-sm px-3 py-2.5">
                          <Link href={`/dashboard/videos/${r.video.id}`} className="line-clamp-2 text-neutral-200 hover:underline">
                            {r.video.title ?? '(untitled)'}
                          </Link>
                        </td>
                        <td className="px-3 py-2.5 text-neutral-400">{avatarName.get(r.video.avatarId)}</td>
                        <td className="px-3 py-2.5 text-neutral-400">{PLATFORM_DISPLAY_NAME[r.video.platform]}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-neutral-400">{fmtDate(r.video.publishedAt)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{r.ageDays === null ? '—' : r.ageDays.toFixed(0)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" title={`Exact: ${fmtInt(r.lifetime)}`}>{fmtInt(r.lifetime)}</td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                          {fmtInt(r.gained)}
                          {r.gainedPartial && <span className="ml-1 text-xs text-neutral-600" title="Partly estimated: not enough syncs inside the range">~</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{fmtInt(r.velocity24h)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-neutral-400">{r.daysToPeak === null ? '—' : `${r.daysToPeak}d`}</td>
                        <td className="px-3 py-2.5"><Sparkline values={r.spark} color="#38bdf8" /></td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{fmtPct(r.engagement)}</td>
                        {hasSaves && <td className="px-3 py-2.5 text-right tabular-nums">{fmtInt(last?.saves)}</td>}
                        <td className="px-3 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {r.status && <Badge>{r.status}</Badge>}
                            {r.breakout && <Badge tone="blue">Breakout</Badge>}
                            {r.lateBreakout && <Badge tone="amber">Late breakout</Badge>}
                            {r.zeroViews48h && <Badge tone="red">0 views</Badge>}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <button type="submit" className="rounded-md border border-neutral-600 px-3 py-1 text-sm text-neutral-200 hover:border-neutral-400">
                Compare selected videos (max 5)
              </button>
              <div className="flex items-center gap-3 text-sm text-neutral-400">
                {page > 1 && <Link href={href({ page: String(page - 1) })} className="hover:text-neutral-100">← Previous</Link>}
                <span>
                  Page {page} of {pages}
                </span>
                {page < pages && <Link href={href({ page: String(page + 1) })} className="hover:text-neutral-100">Next →</Link>}
              </div>
            </div>
          </form>
        )}
        <p className="mt-3 text-xs text-neutral-600">
          Average watch time and saves are hidden: no connected platform returns them yet (the TikTok Display API returns neither; YouTube needs the Analytics API). Video length and topic need new database fields.
        </p>
      </Card>
    </div>
  )
}

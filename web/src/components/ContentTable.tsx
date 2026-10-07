import type { MetricSnapshot, PlatformContent } from '@/types/database'
import Link from 'next/link'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { Sparkline } from '@/components/charts/Sparkline'
import { Badge } from '@/components/ui'
import type { VideoRow } from '@/lib/videos'

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n)
}

function fmtDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtRate(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n.toFixed(2)}%`
}

// Computed from the snapshot's own numbers rather than trusting the stored `engagement_rate`
// column — that column is only populated by sync runs from after engagement-rate calculation was
// added (see AppViewModel/SyncWorker history), so older snapshots would otherwise show "—" even
// though the raw numbers needed to compute it are sitting right there in the same row.
function engagementRate(metrics: MetricSnapshot | undefined): number | null {
  if (!metrics || !metrics.views || metrics.views <= 0) return null
  const engaged = (metrics.likes ?? 0) + (metrics.comments ?? 0) + (metrics.shares ?? 0) + (metrics.saves ?? 0)
  return (engaged / metrics.views) * 100
}

export function ContentTable({
  content,
  latestByContentId,
  extras,
}: {
  content: PlatformContent[]
  latestByContentId: Map<string, MetricSnapshot>
  extras?: Map<string, VideoRow>
}) {
  // Hide columns no connected platform returns yet, instead of a wall of dashes.
  const showSaves = content.some((c) => (latestByContentId.get(c.id)?.saves ?? 0) > 0)
  const showWatch = content.some((c) => (latestByContentId.get(c.id)?.average_watch_time_seconds ?? 0) > 0)
  if (content.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-400">
        No content synced yet for this avatar&apos;s connected accounts.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-neutral-800">
      <table className="w-full text-left text-sm">
        <thead className="bg-neutral-900 text-neutral-400">
          <tr>
            <th className="px-3 py-2 font-medium">Published</th>
            <th className="px-3 py-2 font-medium">Platform</th>
            <th className="px-3 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium text-right">Views</th>
            <th className="px-3 py-2 font-medium text-right">Likes</th>
            <th className="px-3 py-2 font-medium text-right">Comments</th>
            <th className="px-3 py-2 font-medium text-right">Shares</th>
            {showSaves && <th className="px-3 py-2 font-medium text-right">Saves</th>}
            {showWatch && <th className="px-3 py-2 font-medium text-right">Avg. watch</th>}
            <th className="px-3 py-2 font-medium text-right">Engagement</th>
            {extras && <th className="px-3 py-2 font-medium text-right">Gained</th>}
            {extras && <th className="px-3 py-2 font-medium text-right">24 h</th>}
            {extras && <th className="px-3 py-2 font-medium text-right">To peak</th>}
            {extras && <th className="px-3 py-2 font-medium">14 days</th>}
            {extras && <th className="px-3 py-2 font-medium">Status</th>}
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2 font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-800">
          {content.map((item) => {
            const metrics = latestByContentId.get(item.id)
            return (
              <tr key={item.id}>
                <td className="px-3 py-2 whitespace-nowrap text-neutral-400">{fmtDate(item.published_at)}</td>
                <td className="px-3 py-2 text-neutral-300">{PLATFORM_DISPLAY_NAME[item.platform]}</td>
                <td className="max-w-xs truncate px-3 py-2 text-neutral-100">
                  {extras ? (
                    <Link href={`/dashboard/videos/${item.id}`} className="hover:underline">{item.title ?? '(untitled)'}</Link>
                  ) : (
                    (item.title ?? '(untitled)')
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.views)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.likes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.comments)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.shares)}</td>
                {showSaves && <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.saves)}</td>}
                {showWatch && <td className="px-3 py-2 text-right tabular-nums">{fmtDuration(metrics?.average_watch_time_seconds)}</td>}
                <td className="px-3 py-2 text-right tabular-nums">{fmtRate(engagementRate(metrics))}</td>
                {extras && (() => {
                  const x = extras.get(item.id)
                  return (
                    <>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">{x ? fmtNumber(x.gained) : '—'}{x?.gainedPartial && <span className="ml-1 text-xs text-neutral-600" title="Partly estimated">~</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-400">{x ? fmtNumber(x.velocity24h) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-400">{x?.daysToPeak == null ? '—' : `${x.daysToPeak}d`}</td>
                      <td className="px-3 py-2">{x ? <Sparkline values={x.spark} color="#38bdf8" /> : null}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {x?.status && <Badge>{x.status}</Badge>}
                          {x?.breakout && <Badge tone="blue">Breakout</Badge>}
                          {x?.lateBreakout && <Badge tone="amber">Late breakout</Badge>}
                        </div>
                      </td>
                    </>
                  )
                })()}
                <td className="px-3 py-2 whitespace-nowrap text-neutral-500">
                  {metrics ? fmtDate(metrics.captured_at) : 'Never'}
                </td>
                <td className="px-3 py-2">
                  {item.public_url && (
                    <a
                      href={item.public_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-neutral-400 hover:text-neutral-100"
                    >
                      Watch ↗
                    </a>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

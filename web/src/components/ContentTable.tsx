import type { MetricSnapshot, PlatformContent } from '@/types/database'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'

function fmtNumber(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('en-US', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)
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

export function ContentTable({
  content,
  latestByContentId,
}: {
  content: PlatformContent[]
  latestByContentId: Map<string, MetricSnapshot>
}) {
  if (content.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-400">
        No content synced yet for this avatar's connected accounts.
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
            <th className="px-3 py-2 font-medium text-right">Saves</th>
            <th className="px-3 py-2 font-medium text-right">Avg. watch</th>
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
                <td className="max-w-xs truncate px-3 py-2 text-neutral-100">{item.title ?? '(untitled)'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.views)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.likes)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.comments)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.shares)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtNumber(metrics?.saves)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtDuration(metrics?.average_watch_time_seconds)}</td>
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

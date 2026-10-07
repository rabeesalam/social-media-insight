import { withScope } from '@/lib/api'
import { videoRows } from '@/lib/apiData'

const KEYS = ['viewsGained', 'lifetimeViews', 'velocity24h', 'ageDays', 'publishedAt', 'engagementPct', 'daysToPeak'] as const
type SortKey = (typeof KEYS)[number]

export async function GET(request: Request) {
  const url = new URL(request.url)
  const sortParam = url.searchParams.get('sort') as SortKey | null
  const sort: SortKey = sortParam && KEYS.includes(sortParam) ? sortParam : 'viewsGained'
  const dir = url.searchParams.get('dir') === 'asc' ? 1 : -1
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const size = Math.min(200, Math.max(1, Number(url.searchParams.get('size')) || 50))
  return withScope(request, (sc) => {
    const rows = videoRows(sc).sort((a, b) => dir * (Number(a[sort] ?? -1) - Number(b[sort] ?? -1)))
    return { total: rows.length, page, size, videos: rows.slice((page - 1) * size, page * size) }
  })
}

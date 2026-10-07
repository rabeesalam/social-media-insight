import Link from 'next/link'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { BackLink, Card, Empty, PageHeader } from '@/components/ui'
import { DAY_MS } from '@/lib/filters'
import { cumulativeAt } from '@/lib/metrics'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { tryScope } from '@/lib/scope'
import type { ChartRow } from '@/lib/series'

const COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc']

export default async function CompareVideosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams
  const ids = (Array.isArray(raw.id) ? raw.id : raw.id ? [raw.id] : []).slice(0, 5)
  const res = await tryScope({})
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { ds, now } = res.sc
  const picked = ids.map((id) => ds.videos.find((v) => v.id === id)).filter((v): v is NonNullable<typeof v> => !!v)

  const maxDay = Math.max(0, ...picked.map((v) => (v.publishedAt === null ? 0 : Math.min(30, Math.floor((now - v.publishedAt) / DAY_MS)))))
  const rows: ChartRow[] = []
  for (let n = 0; n <= maxDay; n++) {
    const row: ChartRow = { x: `Day ${n}` }
    picked.forEach((v, i) => {
      const val = v.publishedAt === null ? null : cumulativeAt(v, 'views', v.publishedAt + n * DAY_MS)
      row[`s${i}`] = val === null ? null : Math.round(val)
    })
    rows.push(row)
  }

  return (
    <div>
      <div className="mb-3">
        <BackLink href="/dashboard/videos">← Videos</BackLink>
      </div>
      <PageHeader title="Compare videos" subtitle="Lifetime views by days since posting, so you can see which uploads are on track." />
      {picked.length < 2 ? (
        <Empty>Pick 2 to 5 videos in the video table (tick the boxes, then &quot;Compare selected videos&quot;).</Empty>
      ) : (
        <Card title="Lifetime views by day since posting" note="Interpolated between syncs, so days inside a long sync gap are estimates.">
          <SeriesChart rows={rows} xIsDate={false} series={picked.map((v, i) => ({ key: `s${i}`, name: `${PLATFORM_DISPLAY_NAME[v.platform]}: ${(v.title ?? 'video').slice(0, 40)}`, color: COLORS[i % COLORS.length] }))} height={380} />
          <ul className="mt-3 space-y-1 text-xs text-neutral-400">
            {picked.map((v, i) => (
              <li key={v.id}>
                <span style={{ color: COLORS[i % COLORS.length] }}>●</span>{' '}
                <Link href={`/dashboard/videos/${v.id}`} className="hover:underline">{v.title ?? '(untitled)'}</Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}

import { FilterBar } from '@/components/FilterBar'
import { SeriesChart } from '@/components/charts/SeriesChart'
import { Card, DataSince, Empty, exportUrl, Locked, PageHeader } from '@/components/ui'
import { METRIC_LABEL, SPLIT_LABEL, type Filters } from '@/lib/filters'
import { withProjection } from '@/lib/projectChart'
import { tryScope } from '@/lib/scope'
import { buildSeries, firstSnapshotDay } from '@/lib/series'

export default async function TrendsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const res = await tryScope(await searchParams)
  if (!res.sc) return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {res.error}</div>
  const { sc } = res
  const { filters, range, avatars, videos, connections, ds, now } = sc

  // Projections are daily and single-line, so they force those settings.
  const f: Filters = filters.projection ? { ...filters, granularity: 'daily', split: 'none' } : filters
  const base = buildSeries({ filters: f, window: range.current, previous: range.previous, avatars, videos, conns: connections })
  const proj = withProjection(base, f, videos, connections, now)
  const chart = proj.chart
  const kind = filters.projection ? 'line' : filters.kind
  const since = firstSnapshotDay(ds)

  return (
    <div>
      <PageHeader title="Trend explorer" subtitle={`${METRIC_LABEL[filters.metric]} · split by ${SPLIT_LABEL[f.split].toLowerCase()} · ${chart.granularity} · ${range.label}`} />
      <FilterBar action="/dashboard/trends" filters={filters} avatarOptions={ds.avatars} platformOptions={sc.platformOptions} show={{ chart: true, basis: false }} />
      <Card
        title={METRIC_LABEL[filters.metric]}
        note={
          filters.indexed
            ? 'Indexed: every line starts at 100 so small and large avatars can be compared fairly.'
            : filters.log
              ? 'Log scale keeps small avatars readable next to large ones.'
              : 'Dashed grey line = previous period (single total line only). Hollow dots are estimated days.'
        }
        exportHref={exportUrl('timeseries', f)}
      >
        {chart.empty ? (
          <Empty>No history in this range yet for this metric. Syncs from the phone app build this up.</Empty>
        ) : (
          <SeriesChart rows={chart.rows} series={chart.series} kind={kind} log={filters.log} spikes={chart.spikes} height={380} />
        )}
        <DataSince since={since} />
        {proj.method && <p className="mt-1 text-xs text-violet-300">Projection (estimate): {proj.method}. Viral days are capped at the 95th percentile.</p>}
      </Card>
      {proj.note && (
        <div className="mt-4">
          <Locked title="Projection not shown">{proj.note}</Locked>
        </div>
      )}
    </div>
  )
}

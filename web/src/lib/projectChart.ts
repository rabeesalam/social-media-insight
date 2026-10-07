import { DAY_MS } from '@/lib/filters'
import type { Filters } from '@/lib/filters'
import type { Connection, Video } from '@/lib/metrics'
import { MIN_HISTORY_DAYS, capAtP95, project } from '@/lib/projection'
import { addDays, dayKey, realReadingDays, type ChartData, type ChartRow } from '@/lib/series'

export interface ProjectionResult {
  chart: ChartData
  note: string | null // shown when the projection is unavailable
  method: string | null
}

function realVideoDays(videos: Video[], now: number): number {
  const seen = new Set<string>()
  for (const v of videos) for (const s of v.snaps) if (s.t >= now - 28 * DAY_MS) seen.add(dayKey(s.t))
  return seen.size
}

// Adds a dashed projection line and an 80% range to a daily single-total chart, but only when there is
// enough history (spec section 9). Below the minimum it explains when the projection unlocks.
export function withProjection(chart: ChartData, f: Filters, videos: Video[], conns: Connection[], now: number): ProjectionResult {
  if (!f.projection) return { chart, note: null, method: null }
  if (f.split !== 'none') return { chart, note: 'Projections work on one total line. Set "Split by" to None.', method: null }
  if (chart.granularity !== 'daily') return { chart, note: 'Projections need daily granularity.', method: null }

  const stock = f.metric === 'followers'
  const have = stock ? realReadingDays(conns, now, 28) : realVideoDays(videos, now)
  if (have < MIN_HISTORY_DAYS) {
    const unlocks = addDays(dayKey(now), MIN_HISTORY_DAYS - have)
    return {
      chart,
      note: `Projection available from about ${unlocks}: it needs ${MIN_HISTORY_DAYS} days with a sync in the last 28 days, and there are ${have} so far (the phone app must sync daily).`,
      method: null,
    }
  }

  const base = chart.rows.map((r) => (typeof r.s0 === 'number' ? r.s0 : 0))
  let fitted = base
  if (!stock) {
    // Daily gains are spiky, so fit the 7-day rolling average, with viral days capped at the 95th percentile.
    const capped = capAtP95(base)
    fitted = capped.map((_, i) => {
      const slice = capped.slice(Math.max(0, i - 6), i + 1)
      return slice.reduce((a, b) => a + b, 0) / slice.length
    })
  }
  const p = project(fitted, f.projection, f.metric !== 'net_followers')
  if (!p) return { chart, note: 'Not enough daily history to project.', method: null }

  const lastX = String(chart.rows[chart.rows.length - 1]?.x)
  const rows: ChartRow[] = chart.rows.map((r) => ({ ...r }))
  // Connect the projection to the last actual point so the dashed line starts there.
  const last = rows[rows.length - 1]
  last.proj = stock ? (base[base.length - 1] ?? null) : fitted[fitted.length - 1]
  last.proj_lo = last.proj
  last.proj_hi = last.proj
  for (let k = 0; k < p.mid.length; k++) {
    rows.push({ x: addDays(lastX, k + 1), proj: p.mid[k], proj_lo: p.lo[k], proj_hi: p.hi[k] })
  }
  const series = [
    ...chart.series,
    { key: 'proj', name: 'Projection (estimate)', color: '#a78bfa', dashed: true },
    { key: 'proj_lo', name: '80% range low', color: '#6d28d9', dashed: true },
    { key: 'proj_hi', name: '80% range high', color: '#6d28d9', dashed: true },
  ]
  return {
    chart: { ...chart, rows, series },
    note: null,
    method: p.method === 'holt' ? "Holt's double exponential smoothing (growth is curving)" : 'linear trend on the last 28 days',
  }
}

import type { PlatformName } from '@/types/database'
import {
  DAY_MS,
  REPORTING_TZ,
  tzOffsetMs,
  zonedMidnightMs,
  type Filters,
  type Granularity,
  type MetricKey,
  type Window,
} from '@/lib/filters'
import { followersAt, intervalsOf, median, type AvatarRef, type Connection, type Counter, type Video } from '@/lib/metrics'

const STALE_MS = 36 * 60 * 60 * 1000

// ---- day helpers (reporting timezone) -------------------------------------------------------

export function dayKey(ms: number): string {
  return new Date(ms + tzOffsetMs(ms, REPORTING_TZ)).toISOString().slice(0, 10)
}

const dayStartMemo = new Map<string, number>()
export function dayStartMs(key: string): number {
  const hit = dayStartMemo.get(key)
  if (hit !== undefined) return hit
  const [y, m, d] = key.split('-').map(Number)
  const v = zonedMidnightMs(y, m, d)
  dayStartMemo.set(key, v)
  return v
}

const addDaysMemo = new Map<string, string>()
export function addDays(key: string, n: number): string {
  const memoKey = `${key}|${n}`
  const hit = addDaysMemo.get(memoKey)
  if (hit !== undefined) return hit
  const [y, m, d] = key.split('-').map(Number)
  const v = new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
  addDaysMemo.set(memoKey, v)
  return v
}

export function listDays(w: Window): string[] {
  const out: string[] = []
  let k = dayKey(w.startMs)
  const last = dayKey(w.endMs)
  for (let guard = 0; k <= last && guard < 4000; guard++) {
    out.push(k)
    k = addDays(k, 1)
  }
  return out
}

function weekKey(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const dow = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 // Monday = 0
  return addDays(day, -dow)
}

export function bucketOf(day: string, g: Exclude<Granularity, 'auto'>): string {
  if (g === 'daily') return day
  if (g === 'weekly') return weekKey(day)
  return day.slice(0, 7)
}

export function resolveGranularity(g: Granularity, w: Window): Exclude<Granularity, 'auto'> {
  if (g !== 'auto') return g
  const days = (w.endMs - w.startMs) / DAY_MS
  if (days <= 31) return 'daily'
  if (days <= 181) return 'weekly'
  return 'monthly'
}

// ---- daily gains ----------------------------------------------------------------------------

export interface DayPoint {
  value: number
  est: boolean
  topVideoId?: string
  topGain?: number
}

export function dailyGains(videos: Video[], w: Window, field: Counter, trackTop = false): Map<string, DayPoint> {
  const out = new Map<string, DayPoint>()
  const perDayVideo = trackTop ? new Map<string, Map<string, number>>() : null
  for (const v of videos) {
    for (const iv of intervalsOf(v, field)) {
      const a = Math.max(iv.a, w.startMs)
      const b = Math.min(iv.b, w.endMs)
      if (b <= a || iv.gain === 0) continue
      const share = (iv.gain * (b - a)) / (iv.b - iv.a)
      const est = iv.b - iv.a > STALE_MS
      let cursor = a
      for (let guard = 0; cursor < b && guard < 4000; guard++) {
        const key = dayKey(cursor)
        const dayEnd = Math.min(b, dayStartMs(addDays(key, 1)))
        const part = (share * (dayEnd - cursor)) / (b - a)
        const cur = out.get(key) ?? { value: 0, est: false }
        cur.value += part
        if (est) cur.est = true
        out.set(key, cur)
        if (perDayVideo) {
          const m = perDayVideo.get(key) ?? new Map<string, number>()
          m.set(v.id, (m.get(v.id) ?? 0) + part)
          perDayVideo.set(key, m)
        }
        cursor = dayEnd
      }
    }
  }
  if (perDayVideo) {
    for (const [key, m] of perDayVideo) {
      let best: [string, number] | null = null
      for (const e of m) if (!best || e[1] > best[1]) best = e
      const pt = out.get(key)
      if (pt && best) {
        pt.topVideoId = best[0]
        pt.topGain = best[1]
      }
    }
  }
  return out
}

function postedPerDay(videos: Video[], w: Window): Map<string, DayPoint> {
  const out = new Map<string, DayPoint>()
  for (const v of videos) {
    if (v.publishedAt === null || v.publishedAt < w.startMs || v.publishedAt > w.endMs) continue
    const key = dayKey(v.publishedAt)
    const cur = out.get(key) ?? { value: 0, est: false }
    cur.value += 1
    out.set(key, cur)
  }
  return out
}

// Followers at the end of each day, summed over connections. Days with no reading are carried or
// interpolated and flagged estimated.
export function followerDaily(conns: Connection[], w: Window): Map<string, DayPoint> {
  const out = new Map<string, DayPoint>()
  const days = listDays(w)
  for (const day of days) {
    const t = Math.min(w.endMs, dayStartMs(addDays(day, 1)) - 1)
    let total = 0
    let any = false
    let est = false
    for (const c of conns) {
      const at = followersAt(c.snaps, t)
      if (!at) continue
      any = true
      total += at.value
      const hasReadingThatDay = c.snaps.some((s) => dayKey(s.t) === day)
      if (!hasReadingThatDay || at.partial) est = true
    }
    if (any) out.set(day, { value: Math.round(total), est })
  }
  return out
}

// ---- chart series ---------------------------------------------------------------------------

export interface ChartSeries {
  key: string
  name: string
  color: string
  dashed?: boolean
  bandLo?: string
  bandHi?: string
}

export type ChartRow = Record<string, number | string | boolean | null>

export interface Spike {
  x: string
  y: number
  label: string
}

export interface ChartData {
  rows: ChartRow[]
  series: ChartSeries[]
  spikes: Spike[]
  granularity: Exclude<Granularity, 'auto'>
  isStock: boolean // followers: last value per bucket instead of a sum
  empty: boolean
}

const PALETTE = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#34d399', '#fb923c', '#f87171', '#60a5fa', '#e879f9']
export const PLATFORM_COLOR: Record<PlatformName, string> = {
  tiktok: '#22d3ee',
  youtube: '#f87171',
  instagram: '#e879f9',
  facebook: '#60a5fa',
  threads: '#a3a3a3',
  x: '#d4d4d4',
}

export function avatarColor(avatars: AvatarRef[], id: string): string {
  const i = avatars.findIndex((a) => a.id === id)
  return PALETTE[(i < 0 ? 0 : i) % PALETTE.length]
}

const COUNTER: Partial<Record<MetricKey, Counter>> = { views: 'views', likes: 'likes', comments: 'comments', shares: 'shares' }

export interface Group {
  key: string
  name: string
  color: string
  videos: Video[]
  conns: Connection[]
}

export function makeGroups(
  split: Filters['split'],
  avatars: AvatarRef[],
  videos: Video[],
  conns: Connection[]
): Group[] {
  if (split === 'none') return [{ key: 'total', name: 'Total', color: '#e5e5e5', videos, conns }]
  if (split === 'platform') {
    const platforms = Array.from(new Set([...videos.map((v) => v.platform), ...conns.map((c) => c.platform)]))
    return platforms.map((p) => ({
      key: p,
      name: p === 'tiktok' ? 'TikTok' : p === 'youtube' ? 'YouTube' : p.charAt(0).toUpperCase() + p.slice(1),
      color: PLATFORM_COLOR[p],
      videos: videos.filter((v) => v.platform === p),
      conns: conns.filter((c) => c.platform === p),
    }))
  }
  return avatars
    .map((a) => ({
      key: a.id,
      name: a.name,
      color: avatarColor(avatars, a.id),
      videos: videos.filter((v) => v.avatarId === a.id),
      conns: conns.filter((c) => c.avatarId === a.id),
    }))
    .filter((g) => g.videos.length > 0 || g.conns.length > 0)
}

function dayValues(group: Group, metric: MetricKey, w: Window): Map<string, DayPoint> {
  const counter = COUNTER[metric]
  if (counter) return dailyGains(group.videos, w, counter, false)
  if (metric === 'videos') return postedPerDay(group.videos, w)
  const stock = followerDaily(group.conns, w)
  if (metric === 'followers') return stock
  // net_followers: day-over-day difference
  const out = new Map<string, DayPoint>()
  const days = listDays(w)
  for (let i = 1; i < days.length; i++) {
    const a = stock.get(days[i - 1])
    const b = stock.get(days[i])
    if (a && b) out.set(days[i], { value: b.value - a.value, est: a.est || b.est })
  }
  return out
}

function aggregate(
  days: string[],
  perDay: Map<string, DayPoint>,
  g: Exclude<Granularity, 'auto'>,
  stock: boolean
): Map<string, { value: number; est: boolean }> {
  const out = new Map<string, { value: number; est: boolean }>()
  for (const day of days) {
    const pt = perDay.get(day)
    if (!pt) continue
    const key = bucketOf(day, g)
    const cur = out.get(key)
    if (stock) out.set(key, { value: pt.value, est: pt.est }) // days ascend, so last wins
    else out.set(key, { value: (cur?.value ?? 0) + pt.value, est: (cur?.est ?? false) || pt.est })
  }
  return out
}

export interface SeriesInput {
  filters: Filters
  window: Window
  previous: Window | null
  avatars: AvatarRef[]
  videos: Video[]
  conns: Connection[]
  groups?: Group[] // overrides the split (e.g. one line per connected account)
}

export function buildSeries(input: SeriesInput): ChartData {
  const { filters: f, window: w, previous, avatars, videos, conns } = input
  const metric = f.metric
  const g = resolveGranularity(f.granularity, w)
  const stock = metric === 'followers'
  const days = listDays(w)
  const groups = input.groups ?? makeGroups(f.split, avatars, videos, conns)

  const bucketKeys: string[] = []
  for (const d of days) {
    const k = bucketOf(d, g)
    if (bucketKeys[bucketKeys.length - 1] !== k) bucketKeys.push(k)
  }

  const series: ChartSeries[] = []
  const rows: ChartRow[] = bucketKeys.map((k) => ({ x: k }))
  const dailyTotal = new Map<string, DayPoint>()

  groups.forEach((grp, gi) => {
    const sKey = `s${gi}`
    const perDay = dayValues(grp, metric, w)
    const agg = aggregate(days, perDay, g, stock)
    let base: number | null = null
    if (f.indexed) {
      for (const k of bucketKeys) {
        const v = agg.get(k)?.value
        if (v !== undefined && v > 0) {
          base = v
          break
        }
      }
    }
    series.push({ key: sKey, name: grp.name, color: grp.color })
    rows.forEach((row, i) => {
      const e = agg.get(bucketKeys[i])
      if (!e) {
        row[sKey] = null
        return
      }
      row[sKey] = f.indexed ? (base ? (e.value / base) * 100 : null) : e.value
      row[`${sKey}__est`] = e.est
    })
    if (f.split === 'none') for (const [d, p] of perDay) dailyTotal.set(d, p)
  })

  // Previous-period overlay (single total line only), aligned bucket by bucket.
  if (previous && f.split === 'none' && groups.length === 1) {
    const prevDays = listDays(previous)
    const prevPerDay = dayValues(groups[0], metric, previous)
    const prevKeys: string[] = []
    for (const d of prevDays) {
      const k = bucketOf(d, g)
      if (prevKeys[prevKeys.length - 1] !== k) prevKeys.push(k)
    }
    const prevAgg = aggregate(prevDays, prevPerDay, g, stock)
    series.push({ key: 'prev', name: 'Previous period', color: '#737373', dashed: true })
    rows.forEach((row, i) => {
      const e = prevKeys[i] ? prevAgg.get(prevKeys[i]) : undefined
      row.prev = e ? e.value : null
    })
  }

  // 7-day rolling average for a daily total of a flow metric.
  if (g === 'daily' && f.split === 'none' && !stock && !f.indexed && groups.length === 1) {
    series.push({ key: 'avg7', name: '7-day average', color: '#fbbf24', dashed: true })
    const vals = rows.map((r) => (typeof r.s0 === 'number' ? r.s0 : 0))
    rows.forEach((row, i) => {
      const from = Math.max(0, i - 6)
      const slice = vals.slice(from, i + 1)
      row.avg7 = slice.length === 7 ? slice.reduce((a, b) => a + b, 0) / 7 : null
    })
  }

  const spikes: Spike[] = []
  if (metric === 'views' && f.split === 'none') {
    const withTop = dailyGains(videos, { startMs: Math.min(w.startMs, w.endMs - 120 * DAY_MS), endMs: w.endMs }, 'views', true)
    const keys = Array.from(withTop.keys()).sort()
    const title = new Map(videos.map((v) => [v.id, v.title ?? 'video']))
    for (let i = 0; i < keys.length; i++) {
      const pt = withTop.get(keys[i])!
      if (keys[i] < days[0] || pt.est) continue // estimated days spread evenly, so they cannot be spikes
      const prior = keys
        .slice(Math.max(0, i - 28), i)
        .map((k) => withTop.get(k)!.value)
        .filter((x) => x > 0)
      const med = median(prior)
      if (prior.length >= 7 && med !== null && pt.value >= 3 * med && pt.value >= f.breakoutFloor) {
        const bucket = bucketOf(keys[i], g)
        if (bucketKeys.includes(bucket)) {
          spikes.push({ x: bucket, y: typeof rows[bucketKeys.indexOf(bucket)]?.s0 === 'number' ? (rows[bucketKeys.indexOf(bucket)].s0 as number) : pt.value, label: `${title.get(pt.topVideoId ?? '') ?? 'video'}`.slice(0, 80) })
        }
      }
    }
  }

  const empty = !rows.some((r) => series.some((s) => typeof r[s.key] === 'number' && s.key !== 'prev' && s.key !== 'avg7'))
  return { rows, series, spikes, granularity: g, isStock: stock, empty }
}

export function firstSnapshotDay(ds: { firstSnapshotMs: number | null }): string | null {
  return ds.firstSnapshotMs === null ? null : dayKey(ds.firstSnapshotMs)
}

// Count of calendar days (in the last `days` days) on which at least one reading exists.
export function realReadingDays(conns: Connection[], endMs: number, days: number): number {
  const seen = new Set<string>()
  const from = endMs - days * DAY_MS
  for (const c of conns) for (const s of c.snaps) if (s.t >= from && s.t <= endMs) seen.add(dayKey(s.t))
  return seen.size
}

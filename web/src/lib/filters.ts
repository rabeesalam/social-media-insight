import type { PlatformName } from '@/types/database'
import { ALL_PLATFORMS } from '@/lib/platforms'

// Reporting timezone for day boundaries (spec F3). Pakistan time has no DST. Timestamps stay UTC
// in the database; only "today", month/quarter-to-date and custom dates are bucketed in this zone.
export const REPORTING_TZ = 'Asia/Karachi'
export const REPORTING_TZ_LABEL = 'Pakistan time (PKT, UTC+5)'

export const RANGE_KEYS = ['today', '7d', '30d', '90d', 'mtd', 'qtd', 'all', 'custom'] as const
export type RangeKey = (typeof RANGE_KEYS)[number]
export const RANGE_LABEL: Record<RangeKey, string> = {
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  mtd: 'Month to date',
  qtd: 'Quarter to date',
  all: 'All-time',
  custom: 'Custom',
}

export type Basis = 'gained' | 'posted'
export const BASIS_LABEL: Record<Basis, string> = {
  gained: 'Gained in period',
  posted: 'Posted in period',
}

export type Compare = 'previous' | 'last_month' | 'none'
export const COMPARE_LABEL: Record<Compare, string> = {
  previous: 'Previous period',
  last_month: 'Same period last month',
  none: 'None',
}

export const DEFAULT_HIT_THRESHOLD = 10000
export const DEFAULT_BREAKOUT_MULT = 3
export const DEFAULT_BREAKOUT_FLOOR = 1000

export const METRICS = ['views', 'likes', 'comments', 'shares', 'videos', 'followers', 'net_followers'] as const
export type MetricKey = (typeof METRICS)[number]
export const METRIC_LABEL: Record<MetricKey, string> = {
  views: 'Views gained',
  likes: 'Likes gained',
  comments: 'Comments gained',
  shares: 'Shares gained',
  videos: 'Videos posted',
  followers: 'Followers',
  net_followers: 'Net followers per day',
}

export const SPLITS = ['avatar', 'platform', 'none'] as const
export type Split = (typeof SPLITS)[number]
export const SPLIT_LABEL: Record<Split, string> = { avatar: 'Avatar', platform: 'Platform', none: 'None (one total)' }

export const GRANULARITIES = ['auto', 'daily', 'weekly', 'monthly'] as const
export type Granularity = (typeof GRANULARITIES)[number]

export const AGE_BUCKETS = ['all', 'u72h', '3to7d', '8to30d', 'o30d'] as const
export type AgeBucket = (typeof AGE_BUCKETS)[number]
export const AGE_LABEL: Record<AgeBucket, string> = {
  all: 'All ages',
  u72h: 'Under 72 h',
  '3to7d': '3–7 days',
  '8to30d': '8–30 days',
  o30d: 'Over 30 days',
}

export const CHART_KINDS = ['line', 'area', 'bar'] as const
export type ChartKind = (typeof CHART_KINDS)[number]

export interface Filters {
  range: RangeKey
  from: string | null // YYYY-MM-DD, custom only
  to: string | null
  basis: Basis
  compare: Compare
  avatars: string[] // empty = all
  platforms: PlatformName[] // empty = all
  hitThreshold: number
  breakoutMult: number
  breakoutFloor: number
  metric: MetricKey
  split: Split
  granularity: Granularity
  log: boolean
  indexed: boolean
  kind: ChartKind
  age: AgeBucket
  q: string
  tag: string
  xpost: boolean
  noOutliers: boolean
  projection: 0 | 7 | 30 | 90
}

type Raw = Record<string, string | string[] | undefined>

function list(v: string | string[] | undefined): string[] {
  if (v === undefined) return []
  return (Array.isArray(v) ? v : [v]).flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean)
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function parseFilters(raw: Raw): Filters {
  const range = RANGE_KEYS.includes(one(raw.range) as RangeKey) ? (one(raw.range) as RangeKey) : '30d'
  const from = one(raw.from)
  const to = one(raw.to)
  const basis: Basis = one(raw.basis) === 'posted' ? 'posted' : 'gained'
  const compareRaw = one(raw.compare)
  const compare: Compare = compareRaw === 'none' || compareRaw === 'last_month' ? compareRaw : 'previous'
  const threshold = Number(one(raw.hit))
  return {
    range: range === 'custom' && !(from && DATE_RE.test(from)) ? '30d' : range,
    from: from && DATE_RE.test(from) ? from : null,
    to: to && DATE_RE.test(to) ? to : null,
    basis,
    compare,
    avatars: list(raw.avatar),
    platforms: list(raw.platform).filter((p): p is PlatformName => ALL_PLATFORMS.includes(p as PlatformName)),
    hitThreshold: Number.isFinite(threshold) && threshold > 0 ? Math.floor(threshold) : DEFAULT_HIT_THRESHOLD,
    breakoutMult: posNum(one(raw.mult), DEFAULT_BREAKOUT_MULT),
    breakoutFloor: posNum(one(raw.floor), DEFAULT_BREAKOUT_FLOOR),
    metric: METRICS.includes(one(raw.metric) as MetricKey) ? (one(raw.metric) as MetricKey) : 'views',
    split: SPLITS.includes(one(raw.split) as Split) ? (one(raw.split) as Split) : 'avatar',
    granularity: GRANULARITIES.includes(one(raw.gran) as Granularity) ? (one(raw.gran) as Granularity) : 'auto',
    log: one(raw.scale) === 'log',
    indexed: one(raw.norm) === 'indexed',
    kind: CHART_KINDS.includes(one(raw.kind) as ChartKind) ? (one(raw.kind) as ChartKind) : 'line',
    age: AGE_BUCKETS.includes(one(raw.age) as AgeBucket) ? (one(raw.age) as AgeBucket) : 'all',
    q: (one(raw.q) ?? '').slice(0, 100),
    tag: (one(raw.tag) ?? '').replace(/^#/, '').slice(0, 60),
    xpost: one(raw.xpost) === '1',
    noOutliers: one(raw.outliers) === '1',
    projection: ([7, 30, 90] as const).find((n) => String(n) === one(raw.proj)) ?? 0,
  }
}

function posNum(v: string | undefined, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function filtersToQuery(f: Filters): string {
  const q = new URLSearchParams()
  q.set('range', f.range)
  if (f.range === 'custom') {
    if (f.from) q.set('from', f.from)
    if (f.to) q.set('to', f.to)
  }
  if (f.basis !== 'gained') q.set('basis', f.basis)
  if (f.compare !== 'previous') q.set('compare', f.compare)
  if (f.avatars.length) q.set('avatar', f.avatars.join(','))
  if (f.platforms.length) q.set('platform', f.platforms.join(','))
  if (f.hitThreshold !== DEFAULT_HIT_THRESHOLD) q.set('hit', String(f.hitThreshold))
  if (f.breakoutMult !== DEFAULT_BREAKOUT_MULT) q.set('mult', String(f.breakoutMult))
  if (f.breakoutFloor !== DEFAULT_BREAKOUT_FLOOR) q.set('floor', String(f.breakoutFloor))
  if (f.metric !== 'views') q.set('metric', f.metric)
  if (f.split !== 'avatar') q.set('split', f.split)
  if (f.granularity !== 'auto') q.set('gran', f.granularity)
  if (f.log) q.set('scale', 'log')
  if (f.indexed) q.set('norm', 'indexed')
  if (f.kind !== 'line') q.set('kind', f.kind)
  if (f.age !== 'all') q.set('age', f.age)
  if (f.q) q.set('q', f.q)
  if (f.tag) q.set('tag', f.tag)
  if (f.xpost) q.set('xpost', '1')
  if (f.noOutliers) q.set('outliers', '1')
  if (f.projection) q.set('proj', String(f.projection))
  return q.toString()
}

export interface Window {
  startMs: number
  endMs: number
  allTime?: boolean // lifetime totals: gains are exact, nothing is "before the window"
}

export interface ResolvedRange {
  current: Window
  previous: Window | null
  label: string
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>()
const offsetMemo = new Map<string, number>()

// Offset of `tz` from UTC at instant `ms`. Building an Intl.DateTimeFormat is slow, so the formatter is
// cached and results are memoised per hour (offsets only change at DST transitions).
export function tzOffsetMs(ms: number, tz: string): number {
  const memoKey = `${tz}|${Math.floor(ms / 3600000)}`
  const hit = offsetMemo.get(memoKey)
  if (hit !== undefined) return hit
  let fmt = offsetFormatters.get(tz)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    offsetFormatters.set(tz, fmt)
  }
  const parts = fmt.formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  const offset = asUtc - Math.floor(ms / 1000) * 1000
  offsetMemo.set(memoKey, offset)
  return offset
}

// Midnight (in the reporting zone) at the start of the given calendar date.
export function zonedMidnightMs(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d)
  return guess - tzOffsetMs(guess, REPORTING_TZ)
}

export function zonedYMD(ms: number): { y: number; m: number; d: number } {
  const shifted = new Date(ms + tzOffsetMs(ms, REPORTING_TZ))
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() }
}

// Wrapper so components don't call Date.now() directly (react-hooks/purity).
export function nowMs(): number {
  return Date.now()
}

export const DAY_MS = 24 * 60 * 60 * 1000

function shiftMonthBack(ms: number): number {
  const d = new Date(ms)
  d.setUTCMonth(d.getUTCMonth() - 1)
  return d.getTime()
}

export function resolveRange(f: Filters, nowMs: number): ResolvedRange {
  const { y, m, d } = zonedYMD(nowMs)
  let startMs: number
  let endMs = nowMs
  switch (f.range) {
    case 'today':
      startMs = zonedMidnightMs(y, m, d)
      break
    case '7d':
      startMs = nowMs - 7 * DAY_MS
      break
    case '30d':
      startMs = nowMs - 30 * DAY_MS
      break
    case '90d':
      startMs = nowMs - 90 * DAY_MS
      break
    case 'mtd':
      startMs = zonedMidnightMs(y, m, 1)
      break
    case 'qtd':
      startMs = zonedMidnightMs(y, Math.floor((m - 1) / 3) * 3 + 1, 1)
      break
    case 'custom': {
      const [fy, fm, fd] = (f.from as string).split('-').map(Number)
      startMs = zonedMidnightMs(fy, fm, fd)
      if (f.to) {
        const [ty, tm, td] = f.to.split('-').map(Number)
        endMs = Math.min(nowMs, zonedMidnightMs(ty, tm, td) + DAY_MS - 1)
      }
      break
    }
    default:
      startMs = 0
  }
  if (endMs <= startMs) endMs = startMs + 1

  const current: Window = { startMs, endMs, ...(f.range === 'all' ? { allTime: true } : {}) }
  let previous: Window | null = null
  if (f.range !== 'all' && f.compare !== 'none') {
    if (f.compare === 'last_month') {
      previous = { startMs: shiftMonthBack(startMs), endMs: shiftMonthBack(endMs) }
    } else {
      const len = endMs - startMs
      previous = { startMs: startMs - len, endMs: startMs }
    }
  }

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { timeZone: REPORTING_TZ, month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(ms))
  const label = f.range === 'all' ? 'All-time' : `${fmt(startMs)} – ${fmt(endMs)}`
  return { current, previous, label }
}

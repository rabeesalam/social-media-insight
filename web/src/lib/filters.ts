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

export interface Filters {
  range: RangeKey
  from: string | null // YYYY-MM-DD, custom only
  to: string | null
  basis: Basis
  compare: Compare
  avatars: string[] // empty = all
  platforms: PlatformName[] // empty = all
  hitThreshold: number
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
  }
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
  return q.toString()
}

export interface Window {
  startMs: number
  endMs: number
}

export interface ResolvedRange {
  current: Window
  previous: Window | null
  label: string
}

function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms))
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - Math.floor(ms / 1000) * 1000
}

// Midnight (in the reporting zone) at the start of the given calendar date.
function zonedMidnightMs(y: number, m: number, d: number): number {
  const guess = Date.UTC(y, m - 1, d)
  return guess - tzOffsetMs(guess, REPORTING_TZ)
}

function zonedYMD(ms: number): { y: number; m: number; d: number } {
  const shifted = new Date(ms + tzOffsetMs(ms, REPORTING_TZ))
  return { y: shifted.getUTCFullYear(), m: shifted.getUTCMonth() + 1, d: shifted.getUTCDate() }
}

// Wrapper so components don't call Date.now() directly (react-hooks/purity).
export function nowMs(): number {
  return Date.now()
}

const DAY_MS = 24 * 60 * 60 * 1000

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

  const current = { startMs, endMs }
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

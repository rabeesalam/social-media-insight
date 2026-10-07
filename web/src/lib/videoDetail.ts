import { DAY_MS } from '@/lib/filters'
import { cumulativeAt, lifetimeAt, median, type Video } from '@/lib/metrics'
import { dayKey, type ChartRow } from '@/lib/series'
import { videoDaily, type DailyView } from '@/lib/videos'

const TRUST_GAP = 36 * 60 * 60 * 1000 // only trust interpolation across syncs that are at most this far apart

function pct(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))]
}

export interface TypicalCurve {
  rows: ChartRow[]
  peers: number
}

// The avatar's typical growth curve on this platform: median (with 25th-75th percentile band) of its
// other videos' lifetime views at the same age. A day is only plotted when at least 5 peers have a
// trustworthy value for that age.
export function typicalCurve(v: Video, all: Video[], maxDays: number): TypicalCurve {
  const peers = all.filter((p) => p.id !== v.id && p.avatarId === v.avatarId && p.platform === v.platform && p.publishedAt !== null)
  const rows: ChartRow[] = []
  if (v.publishedAt === null) return { rows, peers: peers.length }
  for (let n = 0; n <= maxDays; n++) {
    const vals = peers
      .map((p) => cumulativeAt(p, 'views', (p.publishedAt as number) + n * DAY_MS, TRUST_GAP))
      .filter((x): x is number => x !== null)
      .sort((a, b) => a - b)
    const mine = cumulativeAt(v, 'views', (v.publishedAt as number) + n * DAY_MS, Infinity)
    const row: ChartRow = { x: `Day ${n}`, video: mine === null ? null : Math.round(mine) }
    if (vals.length >= 5) {
      row.typical = Math.round(pct(vals, 0.5))
      row.p25 = Math.round(pct(vals, 0.25))
      row.p75 = Math.round(pct(vals, 0.75))
    }
    rows.push(row)
  }
  return { rows, peers: peers.length }
}

export interface VideoProjection {
  rows: ChartRow[]
  peers: number
  needed: number
  available: boolean
  reason: string | null
}

// Spec section 9: median of (views at day N+k / views at day N) across the avatar's past videos on the
// same platform, applied to this video's current views. Needs the video to be 3+ days old and the
// avatar to have 20+ past videos with daily history.
export function videoProjection(v: Video, all: Video[], horizon: number, nowMs: number): VideoProjection {
  const needed = 20
  const base = { rows: [] as ChartRow[], needed }
  if (v.publishedAt === null) return { ...base, peers: 0, available: false, reason: 'No publish date for this video.' }
  const ageDays = Math.floor((nowMs - v.publishedAt) / DAY_MS)
  if (ageDays < 3) return { ...base, peers: 0, available: false, reason: 'Projection starts once the video is 3 days old.' }
  const current = lifetimeAt(v, nowMs, 'views')
  if (current === null || current <= 0) return { ...base, peers: 0, available: false, reason: 'The video has no views yet.' }

  const peers = all.filter((p) => p.id !== v.id && p.avatarId === v.avatarId && p.platform === v.platform && p.publishedAt !== null)
  const step = Math.max(1, Math.floor(horizon / 15))
  const rows: ChartRow[] = []
  let usable = 0
  for (let k = step; k <= horizon; k += step) {
    const ratios: number[] = []
    for (const p of peers) {
      const at = cumulativeAt(p, 'views', (p.publishedAt as number) + ageDays * DAY_MS, TRUST_GAP)
      const later = cumulativeAt(p, 'views', (p.publishedAt as number) + (ageDays + k) * DAY_MS, TRUST_GAP)
      if (at !== null && later !== null && at > 0) ratios.push(later / at)
    }
    if (k === step) usable = ratios.length
    if (ratios.length < needed) continue
    ratios.sort((a, b) => a - b)
    rows.push({
      x: `Day ${ageDays + k}`,
      proj: Math.round(current * (median(ratios) ?? 1)),
      proj_lo: Math.round(current * pct(ratios, 0.25)),
      proj_hi: Math.round(current * pct(ratios, 0.75)),
    })
  }
  if (rows.length === 0) {
    return { ...base, peers: usable, available: false, reason: `Only ${usable} of the avatar's past ${platformName(v)} videos have daily history around day ${ageDays}; ${needed} are needed.` }
  }
  return { rows, peers: usable, needed, available: true, reason: null }
}

function platformName(v: Video): string {
  return v.platform === 'tiktok' ? 'TikTok' : v.platform === 'youtube' ? 'YouTube' : v.platform
}

export interface VideoSummary {
  daily: DailyView[]
  biggest: DailyView | null
  daysToPeak: number | null
  first48hShare: number | null
  engagementNow: number | null
  engagementDay3: number | null
}

export function summarize(v: Video, nowMs: number, mult: number, floor: number): VideoSummary {
  const daily = videoDaily(v, nowMs, mult, floor)
  const real = daily.filter((d) => !d.est)
  const biggest = (real.length ? real : daily).reduce<DailyView | null>((a, b) => (!a || b.gain > a.gain ? b : a), null)
  const total = lifetimeAt(v, nowMs, 'views')
  let first48hShare: number | null = null
  let engagementDay3: number | null = null
  if (v.publishedAt !== null && total && total > 0) {
    const at48 = cumulativeAt(v, 'views', v.publishedAt + 2 * DAY_MS, TRUST_GAP)
    if (at48 !== null) first48hShare = (at48 / total) * 100
    const eng = (t: number) => {
      const views = cumulativeAt(v, 'views', t, TRUST_GAP)
      const l = cumulativeAt(v, 'likes', t, TRUST_GAP)
      const c = cumulativeAt(v, 'comments', t, TRUST_GAP)
      return views && views > 0 && l !== null && c !== null ? ((l + c) / views) * 100 : null
    }
    engagementDay3 = eng(v.publishedAt + 3 * DAY_MS)
  }
  const last = v.snaps[v.snaps.length - 1]
  const engagementNow = last && last.views ? (((last.likes ?? 0) + (last.comments ?? 0)) / last.views) * 100 : null
  const daysToPeak = biggest && v.publishedAt !== null ? Math.max(0, Math.round((Date.parse(`${biggest.day}T00:00:00Z`) - Date.parse(`${dayKey(v.publishedAt)}T00:00:00Z`) ) / DAY_MS)) : null
  return { daily, biggest, daysToPeak, first48hShare, engagementNow, engagementDay3 }
}

import { DAY_MS, type AgeBucket, type Filters, type Window } from '@/lib/filters'
import { addDays, dailyGains, dayStartMs, listDays } from '@/lib/series'
import { gainOf, lifetimeAt, median, type Video } from '@/lib/metrics'

export type VideoStatus = 'New' | 'Growing' | 'Plateaued'

export interface VideoRow {
  video: Video
  lifetime: number | null
  gained: number
  gainedPartial: boolean
  velocity24h: number
  velocity72h: number
  ageDays: number | null
  daysToPeak: number | null
  status: VideoStatus | null
  breakout: boolean
  lateBreakout: boolean
  spark: number[] // daily views gained, last 14 days
  engagement: number | null
  zeroViews48h: boolean
  hashtags: string[]
}

export function hashtagsOf(caption: string | null): string[] {
  if (!caption) return []
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu) ?? []
  return Array.from(new Set(tags.map((t) => t.slice(1).toLowerCase())))
}

function gainedBetween(v: Video, startMs: number, endMs: number): number {
  return gainOf(v, { startMs, endMs }, 'views')?.value ?? 0
}

export interface DailyView {
  day: string
  gain: number
  lifetime: number | null
  est: boolean
  isBreakout: boolean
}

// Day-by-day growth of one video from its saved snapshots. A day inside a long gap between syncs
// is an even-spread estimate and can never be flagged as a breakout.
export function videoDaily(v: Video, nowMs: number, mult: number, floor: number): DailyView[] {
  const start = v.publishedAt ?? v.snaps[0]?.t
  if (start === undefined) return []
  const gains = dailyGains([v], { startMs: start, endMs: nowMs }, 'views')
  const days = listDays({ startMs: start, endMs: nowMs })
  const out: DailyView[] = []
  const history: number[] = []
  for (const day of days) {
    const pt = gains.get(day)
    const gain = pt?.value ?? 0
    const prior = history.slice(-7)
    const avg = prior.length >= 3 ? prior.reduce((a, b) => a + b, 0) / prior.length : null
    const isBreakout = !!pt && !pt.est && avg !== null && gain >= mult * avg && gain >= floor
    out.push({
      day,
      gain,
      lifetime: lifetimeAt(v, Math.min(nowMs, dayStartMs(addDays(day, 1)) - 1), 'views'),
      est: pt?.est ?? true,
      isBreakout,
    })
    history.push(gain)
  }
  return out
}

export function ageBucketOk(v: Video, age: AgeBucket, nowMs: number): boolean {
  if (age === 'all') return true
  if (v.publishedAt === null) return false
  const days = (nowMs - v.publishedAt) / DAY_MS
  if (age === 'u72h') return days < 3
  if (age === '3to7d') return days >= 3 && days <= 7
  if (age === '8to30d') return days > 7 && days <= 30
  return days > 30
}

export function buildVideoRows(videos: Video[], w: Window, f: Filters, nowMs: number): VideoRow[] {
  const rows: VideoRow[] = []
  for (const v of videos) {
    const g = gainOf(v, w, 'views')
    const lifetime = lifetimeAt(v, w.endMs, 'views')
    const ageDays = v.publishedAt === null ? null : (nowMs - v.publishedAt) / DAY_MS
    const daily = videoDaily(v, nowMs, f.breakoutMult, f.breakoutFloor)
    const inWindow = daily.filter((d) => dayStartMs(d.day) >= w.startMs && dayStartMs(d.day) <= w.endMs)
    const breakout = inWindow.some((d) => d.isBreakout)
    let daysToPeak: number | null = null
    let lateBreakout = false
    const real = daily.filter((d) => !d.est)
    if (v.publishedAt !== null && real.length > 0) {
      const peak = real.reduce((a, b) => (b.gain > a.gain ? b : a))
      if (peak.gain > 0) {
        daysToPeak = Math.max(0, Math.round((dayStartMs(peak.day) - v.publishedAt) / DAY_MS))
        lateBreakout = daysToPeak >= 7 && peak.isBreakout
      }
    }
    let status: VideoStatus | null = null
    if (ageDays !== null) {
      if (ageDays < 3) status = 'New'
      else {
        const last3 = daily.slice(-3)
        const flat =
          last3.length === 3 && last3.every((d) => !d.est && d.lifetime !== null && d.lifetime > 0 && d.gain / d.lifetime < 0.01)
        status = flat ? 'Plateaued' : 'Growing'
      }
    }
    const last = v.snaps[v.snaps.length - 1]
    const eng =
      last && last.views && last.views > 0
        ? (((last.likes ?? 0) + (last.comments ?? 0) + (last.shares ?? 0) + (last.saves ?? 0)) / last.views) * 100
        : null
    rows.push({
      video: v,
      lifetime,
      gained: Math.round(g?.value ?? 0),
      gainedPartial: g?.partial ?? false,
      velocity24h: Math.round(gainedBetween(v, nowMs - DAY_MS, nowMs)),
      velocity72h: Math.round(gainedBetween(v, nowMs - 3 * DAY_MS, nowMs)),
      ageDays,
      daysToPeak,
      status,
      breakout,
      lateBreakout,
      spark: daily.slice(-14).map((d) => Math.round(d.gain)),
      engagement: eng,
      zeroViews48h: ageDays !== null && ageDays > 2 && lifetime === 0 && !!last,
      hashtags: hashtagsOf(v.caption),
    })
  }
  return rows
}

// ---- cross-post detection (same avatar, other platform, within 24 h, >= 80% similar) ----------

function norm(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

export function similarity(a: string, b: string): number {
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  // Compare the shorter text with the start of the longer one: a YouTube title is usually a trimmed
  // version of the TikTok caption.
  const [short, long] = x.length <= y.length ? [x, y] : [y, x]
  const A = bigrams(short)
  const B = bigrams(long.slice(0, Math.ceil(short.length * 1.2)))
  let inter = 0
  for (const [g, n] of A) inter += Math.min(n, B.get(g) ?? 0)
  const total = Array.from(A.values()).reduce((p, c) => p + c, 0) + Array.from(B.values()).reduce((p, c) => p + c, 0)
  return total === 0 ? 0 : (2 * inter) / total
}

export interface CrossPost {
  a: Video
  b: Video
  score: number
}

export function findCrossPosts(videos: Video[]): CrossPost[] {
  const byAvatar = new Map<string, Video[]>()
  for (const v of videos) {
    if (v.publishedAt === null) continue
    const arr = byAvatar.get(v.avatarId) ?? []
    arr.push(v)
    byAvatar.set(v.avatarId, arr)
  }
  const pairs: CrossPost[] = []
  for (const list of byAvatar.values()) {
    list.sort((p, q) => (p.publishedAt as number) - (q.publishedAt as number))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if ((list[j].publishedAt as number) - (list[i].publishedAt as number) > DAY_MS) break
        if (list[i].platform === list[j].platform) continue
        const score = similarity(list[i].caption ?? list[i].title ?? '', list[j].caption ?? list[j].title ?? '')
        if (score >= 0.8) pairs.push({ a: list[i], b: list[j], score })
      }
    }
  }
  return pairs
}

// ---- hashtag / content insights -------------------------------------------------------------

export interface InsightRow {
  key: string
  videos: number
  typicalViews: number | null
  engagement: number | null
  hitRate: number | null
}

export function groupInsights(rows: VideoRow[], keyOf: (r: VideoRow) => string[], hit: number): InsightRow[] {
  const map = new Map<string, VideoRow[]>()
  for (const r of rows) for (const k of keyOf(r)) map.set(k, [...(map.get(k) ?? []), r])
  return Array.from(map.entries())
    .map(([key, list]) => {
      const views = list.map((r) => r.lifetime).filter((x): x is number => x !== null)
      let totalViews = 0
      let engaged = 0
      for (const r of list) {
        const last = r.video.snaps[r.video.snaps.length - 1]
        if (!last || !last.views) continue
        totalViews += last.views
        engaged += (last.likes ?? 0) + (last.comments ?? 0) + (last.shares ?? 0) + (last.saves ?? 0)
      }
      return {
        key,
        videos: list.length,
        typicalViews: median(views),
        engagement: totalViews > 0 ? (engaged / totalViews) * 100 : null,
        hitRate: views.length ? (views.filter((x) => x >= hit).length / views.length) * 100 : null,
      }
    })
    .sort((a, b) => b.videos - a.videos)
}

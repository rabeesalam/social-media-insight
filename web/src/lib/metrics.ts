import type { SupabaseClient } from '@supabase/supabase-js'
import type { ConnectionStatus, PlatformName } from '@/types/database'
import type { Filters, Window } from '@/lib/filters'

// All numbers here derive from the append-only metric_snapshots / account_metric_snapshots tables.
// "Gained in period" = value at window end minus value at window start, read from those snapshots.
// Where history is too short to know the start value we fall back to the first snapshot inside the
// window and flag the result as partial, rather than pretending it is exact.

const PAGE = 1000

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

export interface Snap {
  t: number
  views: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
}

export interface Video {
  id: string
  platform: PlatformName
  connectionId: string
  avatarId: string
  title: string | null
  caption: string | null
  url: string | null
  publishedAt: number | null
  snaps: Snap[] // ascending by time
}

export interface AccountSnap {
  t: number
  followers: number | null
}

export interface Connection {
  id: string
  avatarId: string
  platform: PlatformName
  status: ConnectionStatus
  lastError: string | null
  tokenExpiresAt: string | null
  lastSyncAt: string | null
  snaps: AccountSnap[]
}

export interface AvatarRef {
  id: string
  name: string
}

export interface Dataset {
  avatars: AvatarRef[]
  connections: Connection[]
  videos: Video[]
  firstSnapshotMs: number | null
}

export async function loadDataset(supabase: SupabaseClient): Promise<Dataset> {
  const [avatars, connections, content, snapshots, accountSnapshots] = await Promise.all([
    supabase.from('avatars').select('id, name').order('name').then(({ data }) => (data ?? []) as AvatarRef[]),
    supabase
      .from('platform_connections_safe')
      .select('id, avatar_id, platform, status, last_error, token_expires_at, last_sync_at')
      .then(({ data }) => (data ?? []) as { id: string; avatar_id: string; platform: PlatformName; status: ConnectionStatus; last_error: string | null; token_expires_at: string | null; last_sync_at: string | null }[]),
    fetchAll<{ id: string; platform: PlatformName; platform_connection_id: string; published_at: string | null; title: string | null; caption: string | null; public_url: string | null }>(
      (from, to) => supabase.from('platform_content').select('id, platform, platform_connection_id, published_at, title, caption, public_url').order('id').range(from, to)
    ),
    fetchAll<{ id: string; platform_content_id: string; captured_at: string; views: number | null; likes: number | null; comments: number | null; shares: number | null; saves: number | null }>(
      (from, to) => supabase.from('metric_snapshots').select('id, platform_content_id, captured_at, views, likes, comments, shares, saves').order('id').range(from, to)
    ),
    fetchAll<{ id: string; platform_connection_id: string; captured_at: string; followers: number | null }>(
      (from, to) => supabase.from('account_metric_snapshots').select('id, platform_connection_id, captured_at, followers').order('id').range(from, to)
    ),
  ])

  const connById = new Map(connections.map((c) => [c.id, c]))

  const snapsByContent = new Map<string, Snap[]>()
  let firstSnapshotMs: number | null = null
  for (const s of snapshots) {
    const t = new Date(s.captured_at).getTime()
    if (firstSnapshotMs === null || t < firstSnapshotMs) firstSnapshotMs = t
    const arr = snapsByContent.get(s.platform_content_id) ?? []
    arr.push({ t, views: s.views, likes: s.likes, comments: s.comments, shares: s.shares, saves: s.saves })
    snapsByContent.set(s.platform_content_id, arr)
  }

  const videos: Video[] = []
  for (const c of content) {
    const conn = connById.get(c.platform_connection_id)
    if (!conn) continue
    const snaps = (snapsByContent.get(c.id) ?? []).sort((a, b) => a.t - b.t)
    videos.push({
      id: c.id,
      platform: c.platform,
      connectionId: conn.id,
      avatarId: conn.avatar_id,
      title: c.title ?? c.caption,
      caption: c.caption ?? c.title,
      url: c.public_url,
      publishedAt: c.published_at ? new Date(c.published_at).getTime() : null,
      snaps,
    })
  }

  const accSnapsByConn = new Map<string, AccountSnap[]>()
  for (const s of accountSnapshots) {
    const arr = accSnapsByConn.get(s.platform_connection_id) ?? []
    arr.push({ t: new Date(s.captured_at).getTime(), followers: s.followers })
    accSnapsByConn.set(s.platform_connection_id, arr)
  }

  return {
    avatars,
    firstSnapshotMs,
    videos,
    connections: connections.map((c) => ({
      id: c.id,
      avatarId: c.avatar_id,
      platform: c.platform,
      status: c.status,
      lastError: c.last_error,
      tokenExpiresAt: c.token_expires_at,
      lastSyncAt: c.last_sync_at,
      snaps: (accSnapsByConn.get(c.id) ?? []).sort((a, b) => a.t - b.t),
    })),
  }
}

export function lastAtOrBefore<T extends { t: number }>(snaps: T[], t: number): T | null {
  let found: T | null = null
  for (const s of snaps) {
    if (s.t <= t) found = s
    else break
  }
  return found
}

export type Counter = 'views' | 'likes' | 'comments' | 'shares' | 'saves'

export interface Gain {
  value: number
  partial: boolean // start value unknown or no sync inside the window
  negative: boolean // platform removed views/likes; clamped to 0
}

const STALE_MS = 36 * 60 * 60 * 1000

export interface Interval {
  a: number
  b: number
  gain: number // clamped to >= 0
  neg: boolean // the platform lowered the count (removed fake views/likes)
}

const intervalCache = new WeakMap<Video, Map<Counter, Interval[]>>()

// Consecutive snapshots form intervals; the gain of an interval is spread evenly over its duration,
// so a period total is always the sum of the daily values inside it. The first interval runs from
// publish time (value 0) to the first snapshot. Long intervals mean we did not sync in between,
// so the day-level split inside them is an estimate.
export function intervalsOf(v: Video, field: Counter): Interval[] {
  let perField = intervalCache.get(v)
  if (!perField) {
    perField = new Map()
    intervalCache.set(v, perField)
  }
  const cached = perField.get(field)
  if (cached) return cached

  const pts: { t: number; val: number }[] = []
  for (const s of v.snaps) {
    const val = s[field]
    if (val !== null) pts.push({ t: s.t, val })
  }
  const out: Interval[] = []
  if (pts.length > 0) {
    if (v.publishedAt !== null && v.publishedAt < pts[0].t) pts.unshift({ t: v.publishedAt, val: 0 })
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      if (b.t <= a.t) continue
      const raw = b.val - a.val
      out.push({ a: a.t, b: b.t, gain: Math.max(0, raw), neg: raw < 0 })
    }
  }
  perField.set(field, out)
  return out
}

export function gainOf(v: Video, w: Window, field: Counter): Gain | null {
  const ivs = intervalsOf(v, field)
  if (ivs.length === 0) return null
  let sum = 0
  let partial = false
  let negative = false
  for (const iv of ivs) {
    const overlap = Math.min(iv.b, w.endMs) - Math.max(iv.a, w.startMs)
    if (overlap <= 0) continue
    sum += (iv.gain * overlap) / (iv.b - iv.a)
    if (iv.b - iv.a > STALE_MS) partial = true
    if (iv.neg) negative = true
  }
  // All-time is the lifetime total, so only a window with a real start can be "partial".
  if (w.allTime) partial = false
  else if (ivs[ivs.length - 1].b < w.endMs - STALE_MS) partial = true // no sync near the end
  return { value: sum, partial, negative }
}

export function lifetimeAt(v: Video, t: number, field: Counter): number | null {
  return lastAtOrBefore(v.snaps, t)?.[field] ?? null
}

export function median(nums: number[]): number | null {
  if (nums.length === 0) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export interface Totals {
  viewsGained: number
  likesGained: number
  commentsGained: number
  sharesGained: number
  savesGained: number
  partialVideos: number
  negativeVideos: number
  postedCount: number
  postedViews: number
  postedLikes: number
  postedComments: number
  postedShares: number
  postedSaves: number
  typicalViews: number | null // median lifetime views of videos posted in the window
  hits: number
  hitRate: number | null
}

export function emptyTotals(): Totals {
  return {
    viewsGained: 0, likesGained: 0, commentsGained: 0, sharesGained: 0, savesGained: 0,
    partialVideos: 0, negativeVideos: 0, postedCount: 0, postedViews: 0, postedLikes: 0,
    postedComments: 0, postedShares: 0, postedSaves: 0, typicalViews: null, hits: 0, hitRate: null,
  }
}

export function computeTotals(videos: Video[], w: Window, hitThreshold: number): Totals {
  const t = emptyTotals()
  const postedViewValues: number[] = []
  for (const v of videos) {
    const gv = gainOf(v, w, 'views')
    if (gv) {
      t.viewsGained += gv.value
      if (gv.partial) t.partialVideos += 1
      if (gv.negative) t.negativeVideos += 1
      t.likesGained += gainOf(v, w, 'likes')?.value ?? 0
      t.commentsGained += gainOf(v, w, 'comments')?.value ?? 0
      t.sharesGained += gainOf(v, w, 'shares')?.value ?? 0
      t.savesGained += gainOf(v, w, 'saves')?.value ?? 0
    }
    if (v.publishedAt !== null && v.publishedAt >= w.startMs && v.publishedAt <= w.endMs) {
      t.postedCount += 1
      const views = lifetimeAt(v, w.endMs, 'views')
      if (views !== null) {
        postedViewValues.push(views)
        t.postedViews += views
        if (views >= hitThreshold) t.hits += 1
      }
      t.postedLikes += lifetimeAt(v, w.endMs, 'likes') ?? 0
      t.postedComments += lifetimeAt(v, w.endMs, 'comments') ?? 0
      t.postedShares += lifetimeAt(v, w.endMs, 'shares') ?? 0
      t.postedSaves += lifetimeAt(v, w.endMs, 'saves') ?? 0
    }
  }
  t.viewsGained = Math.round(t.viewsGained)
  t.likesGained = Math.round(t.likesGained)
  t.commentsGained = Math.round(t.commentsGained)
  t.sharesGained = Math.round(t.sharesGained)
  t.savesGained = Math.round(t.savesGained)
  t.typicalViews = median(postedViewValues)
  t.hitRate = t.postedCount > 0 ? (t.hits / t.postedCount) * 100 : null
  return t
}

export interface Rates {
  /** Engagement in the window: gained basis uses gains, posted basis uses lifetime totals. */
  engagement: number | null
  /** Likes + comments only — the only engagement definition comparable across platforms
   * (the YouTube API returns no shares or saves). */
  crossPlatformEngagement: number | null
}

export function engagementRates(t: Totals, basis: Filters['basis']): Rates {
  const views = basis === 'gained' ? t.viewsGained : t.postedViews
  const likes = basis === 'gained' ? t.likesGained : t.postedLikes
  const comments = basis === 'gained' ? t.commentsGained : t.postedComments
  const shares = basis === 'gained' ? t.sharesGained : t.postedShares
  const saves = basis === 'gained' ? t.savesGained : t.postedSaves
  if (views <= 0) return { engagement: null, crossPlatformEngagement: null }
  return {
    engagement: ((likes + comments + shares + saves) / views) * 100,
    crossPlatformEngagement: ((likes + comments) / views) * 100,
  }
}

export interface FollowerStats {
  current: number | null
  gained: number | null
  start: number | null
  growthPct: number | null // null for accounts under 100 followers (spec: show net count instead)
  partial: boolean
}

// Value at time t: exact reading if we have one at/before t, linearly interpolated when the
// neighbouring readings straddle t, and flagged partial when the neighbours are far apart.
export function followersAt(snaps: AccountSnap[], t: number): { value: number; partial: boolean } | null {
  let prev: AccountSnap | null = null
  let next: AccountSnap | null = null
  for (const s of snaps) {
    if (s.followers === null) continue
    if (s.t <= t) prev = s
    else {
      next = s
      break
    }
  }
  if (prev && next) {
    const frac = (t - prev.t) / (next.t - prev.t)
    const value = (prev.followers as number) + ((next.followers as number) - (prev.followers as number)) * frac
    return { value, partial: next.t - prev.t > STALE_MS }
  }
  if (prev) return { value: prev.followers as number, partial: t - prev.t > STALE_MS }
  if (next) return { value: next.followers as number, partial: true }
  return null
}

export function followerStats(conns: Connection[], w: Window): FollowerStats {
  let current = 0
  let start = 0
  let any = false
  let partial = false
  for (const c of conns) {
    const end = followersAt(c.snaps, w.endMs)
    if (!end) continue
    any = true
    current += end.value
    const base = w.allTime ? null : followersAt(c.snaps, w.startMs)
    if (base) {
      start += base.value
      if (base.partial || end.partial) partial = true
    } else {
      const first = c.snaps.find((x) => x.followers !== null)
      start += first?.followers ?? end.value
      partial = true
    }
  }
  if (!any) return { current: null, gained: null, start: null, growthPct: null, partial: false }
  current = Math.round(current)
  start = Math.round(start)
  const gained = current - start
  return { current, gained, start, growthPct: start >= 100 ? (gained / start) * 100 : null, partial }
}

export function pctChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before <= 0) return null
  return ((now - before) / before) * 100
}

export interface Mover {
  video: Video
  gained: number
  lifetime: number | null
  partial: boolean
}

export function topMovers(videos: Video[], w: Window, basis: Filters['basis'], limit: number): Mover[] {
  const rows: Mover[] = []
  for (const v of videos) {
    const lifetime = lifetimeAt(v, w.endMs, 'views')
    if (basis === 'gained') {
      const g = gainOf(v, w, 'views')
      if (g && g.value > 0) rows.push({ video: v, gained: g.value, lifetime, partial: g.partial })
    } else if (v.publishedAt !== null && v.publishedAt >= w.startMs && v.publishedAt <= w.endMs && lifetime !== null) {
      rows.push({ video: v, gained: lifetime, lifetime, partial: false })
    }
  }
  return rows.sort((a, b) => b.gained - a.gained).slice(0, limit)
}

export interface StaleConnection {
  connection: Connection
  avatarName: string
  lastSyncMs: number | null
  reason: 'needs_reconnect' | 'stale' | 'never'
}

export function staleConnections(ds: Dataset, nowMs: number, maxAgeMs = 24 * 60 * 60 * 1000): StaleConnection[] {
  const avatarName = new Map(ds.avatars.map((a) => [a.id, a.name]))
  const latestVideoSync = new Map<string, number>()
  for (const v of ds.videos) {
    const last = v.snaps[v.snaps.length - 1]
    if (last && last.t > (latestVideoSync.get(v.connectionId) ?? 0)) latestVideoSync.set(v.connectionId, last.t)
  }
  const out: StaleConnection[] = []
  for (const c of ds.connections) {
    if (c.status === 'pending' || c.status === 'disabled') continue
    const accLast = c.snaps.length ? c.snaps[c.snaps.length - 1].t : 0
    const lastSyncMs = Math.max(accLast, latestVideoSync.get(c.id) ?? 0) || null
    const name = avatarName.get(c.avatarId) ?? 'Unknown'
    if (c.status === 'reauthorization_required') out.push({ connection: c, avatarName: name, lastSyncMs, reason: 'needs_reconnect' })
    else if (lastSyncMs === null) out.push({ connection: c, avatarName: name, lastSyncMs, reason: 'never' })
    else if (nowMs - lastSyncMs > maxAgeMs) out.push({ connection: c, avatarName: name, lastSyncMs, reason: 'stale' })
  }
  return out
}

// Cumulative count of a video at time t, linearly interpolated between snapshots (and from 0 at the
// publish time). Returns null outside the range we actually have data for, so callers never invent
// numbers before the first publish or after the last sync.
export function cumulativeAt(v: Video, field: Counter, t: number, maxGapMs = Infinity): number | null {
  const pts: { t: number; val: number }[] = []
  for (const s of v.snaps) {
    const val = s[field]
    if (val !== null) pts.push({ t: s.t, val })
  }
  if (pts.length === 0) return null
  if (v.publishedAt !== null && v.publishedAt < pts[0].t) pts.unshift({ t: v.publishedAt, val: 0 })
  if (t < pts[0].t || t > pts[pts.length - 1].t) return null
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]
    const b = pts[i + 1]
    if (t >= a.t && t <= b.t) {
      if (b.t - a.t > maxGapMs) return null // the sync gap is too long to trust an interpolated value
      return b.t === a.t ? b.val : a.val + ((b.val - a.val) * (t - a.t)) / (b.t - a.t)
    }
  }
  return pts[pts.length - 1].val
}

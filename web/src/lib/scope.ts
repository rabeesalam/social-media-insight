import { createClient } from '@/lib/supabase/server'
import { nowMs, parseFilters, resolveRange, type Filters, type ResolvedRange } from '@/lib/filters'
import { loadDataset, lifetimeAt, type AvatarRef, type Connection, type Dataset, type Video } from '@/lib/metrics'
import { SUPPORTED_PLATFORMS } from '@/lib/platforms'
import { ageBucketOk, findCrossPosts, hashtagsOf } from '@/lib/videos'
import type { PlatformName } from '@/types/database'

export interface Scoped {
  filters: Filters
  now: number
  range: ResolvedRange
  ds: Dataset
  avatars: AvatarRef[]
  videos: Video[]
  connections: Connection[]
  platformOptions: PlatformName[]
}

type Raw = Record<string, string | string[] | undefined>

// Applies every content-level filter from the shared filter bar to the dataset.
export function applyScope(ds: Dataset, f: Filters, now: number): Pick<Scoped, 'avatars' | 'videos' | 'connections'> {
  const avatarOk = (id: string) => f.avatars.length === 0 || f.avatars.includes(id)
  const platformOk = (p: PlatformName) => f.platforms.length === 0 || f.platforms.includes(p)

  let videos = ds.videos.filter((v) => avatarOk(v.avatarId) && platformOk(v.platform) && ageBucketOk(v, f.age, now))
  if (f.q) {
    const q = f.q.toLowerCase()
    videos = videos.filter((v) => `${v.title ?? ''} ${v.caption ?? ''}`.toLowerCase().includes(q))
  }
  if (f.tag) {
    const t = f.tag.toLowerCase()
    videos = videos.filter((v) => hashtagsOf(v.caption).includes(t))
  }
  if (f.xpost) {
    const ids = new Set<string>()
    for (const p of findCrossPosts(videos)) {
      ids.add(p.a.id)
      ids.add(p.b.id)
    }
    videos = videos.filter((v) => ids.has(v.id))
  }
  if (f.noOutliers) {
    // Drop each avatar's top 1% of videos by lifetime views so the "typical" picture is not skewed.
    const drop = new Set<string>()
    for (const a of new Set(videos.map((v) => v.avatarId))) {
      const list = videos
        .filter((v) => v.avatarId === a)
        .map((v) => ({ id: v.id, views: lifetimeAt(v, Number.MAX_SAFE_INTEGER, 'views') ?? 0 }))
        .sort((x, y) => y.views - x.views)
      const n = Math.max(1, Math.ceil(list.length * 0.01))
      for (const x of list.slice(0, n)) drop.add(x.id)
    }
    videos = videos.filter((v) => !drop.has(v.id))
  }

  return {
    avatars: ds.avatars.filter((a) => avatarOk(a.id)),
    videos,
    connections: ds.connections.filter((c) => avatarOk(c.avatarId) && platformOk(c.platform)),
  }
}

// "All-time" starts at 0, which would make every per-day chart loop over 50 years. Start it at the
// earliest thing we know about instead (first snapshot or first publish date), at day granularity.
export function clampAllTime(r: ResolvedRange, ds: Dataset): ResolvedRange {
  if (!r.current.allTime) return r
  const candidates = [ds.firstSnapshotMs, ...ds.videos.map((v) => v.publishedAt)].filter((x): x is number => x !== null)
  const start = candidates.length ? Math.min(...candidates) : r.current.endMs - 30 * 24 * 60 * 60 * 1000
  return { ...r, current: { ...r.current, startMs: start - 24 * 60 * 60 * 1000 } }
}

export async function loadScoped(raw: Raw): Promise<Scoped> {
  const filters = parseFilters(raw)
  const now = nowMs()
  const resolved = resolveRange(filters, now)
  const supabase = await createClient()
  const ds = await loadDataset(supabase)
  const range = clampAllTime(resolved, ds)
  const connected = Array.from(new Set(ds.connections.map((c) => c.platform)))
  const platformOptions = SUPPORTED_PLATFORMS.filter((p) => connected.includes(p)).concat(
    connected.filter((p) => !SUPPORTED_PLATFORMS.includes(p))
  )
  return { filters, now, range, ds, platformOptions, ...applyScope(ds, filters, now) }
}

export async function tryScope(raw: Raw): Promise<{ sc: Scoped; error?: undefined } | { sc?: undefined; error: string }> {
  try {
    return { sc: await loadScoped(raw) }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'unknown error' }
  }
}

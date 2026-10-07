import { DAY_MS } from '@/lib/filters'
import { intervalsOf, lifetimeAt, staleConnections, type Dataset } from '@/lib/metrics'

export interface AccountHealth {
  connectionId: string
  avatarName: string
  platform: string
  status: string
  lastSyncMs: number | null
  lastError: string | null
  tokenExpiresAt: string | null
  tokenState: 'ok' | 'error' | 'reconnect_needed' | 'unknown'
  videos: number
  staleVideos: number // latest snapshot older than 36 h
  negativeGainVideos: number // platform lowered a count (removed fake views/likes)
  zeroViewVideos: number // still 0 views 48 h after posting
  attention: 'needs_reconnect' | 'stale' | 'never' | null
}

export function buildHealth(ds: Dataset, nowMs: number): AccountHealth[] {
  const attention = new Map(staleConnections(ds, nowMs).map((s) => [s.connection.id, s.reason]))
  const avatarName = new Map(ds.avatars.map((a) => [a.id, a.name]))
  return ds.connections.map((c) => {
    const vids = ds.videos.filter((v) => v.connectionId === c.id)
    const lastVideoSync = Math.max(0, ...vids.map((v) => v.snaps[v.snaps.length - 1]?.t ?? 0))
    const lastAcc = c.snaps.length ? c.snaps[c.snaps.length - 1].t : 0
    const lastApi = c.lastSyncAt ? new Date(c.lastSyncAt).getTime() : 0
    const lastSyncMs = Math.max(lastVideoSync, lastAcc, lastApi) || null
    // Access tokens are short-lived and refresh automatically, so their expiry time is not a problem by
    // itself. Only the connection status says whether a person has to reconnect the account.
    let tokenState: AccountHealth['tokenState'] = 'unknown'
    if (c.status === 'reauthorization_required') tokenState = 'reconnect_needed'
    else if (c.status === 'error') tokenState = 'error'
    else if (c.status === 'connected') tokenState = 'ok'
    return {
      connectionId: c.id,
      avatarName: avatarName.get(c.avatarId) ?? 'Unknown',
      platform: c.platform,
      status: c.status,
      lastSyncMs,
      lastError: c.lastError,
      tokenExpiresAt: c.tokenExpiresAt,
      tokenState,
      videos: vids.length,
      staleVideos: vids.filter((v) => v.snaps.length > 0 && nowMs - v.snaps[v.snaps.length - 1].t > 36 * 60 * 60 * 1000).length,
      negativeGainVideos: vids.filter((v) => intervalsOf(v, 'views').some((i) => i.neg)).length,
      zeroViewVideos: vids.filter((v) => v.publishedAt !== null && nowMs - v.publishedAt > 2 * DAY_MS && lifetimeAt(v, nowMs, 'views') === 0).length,
      attention: attention.get(c.id) ?? null,
    }
  })
}

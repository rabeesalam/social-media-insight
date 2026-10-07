import { Badge, Card, Empty, PageHeader } from '@/components/ui'
import { nowMs } from '@/lib/filters'
import { fmtInt } from '@/lib/format'
import { STATUS_DOT, duplicateIds, effectiveStatus, timeAgo } from '@/lib/devices'
import { buildHealth } from '@/lib/health'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { loadDataset } from '@/lib/metrics'
import { createClient } from '@/lib/supabase/server'
import type { Device, PlatformName } from '@/types/database'

const TOKEN_LABEL = {
  ok: ['Connected', 'green'],
  error: ['Error', 'red'],
  reconnect_needed: ['Reconnect needed', 'red'],
  unknown: ['Unknown', 'neutral'],
} as const

export default async function HealthPage() {
  const supabase = await createClient()
  const now = nowMs()
  let ds
  try {
    ds = await loadDataset(supabase)
  } catch (e) {
    return <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">Failed to load: {e instanceof Error ? e.message : 'error'}</div>
  }
  const { data: devices } = await supabase
    .from('devices')
    .select('id, device_uuid, device_name, status, app_version_name, android_version, device_model, last_seen_at, last_sync_at, created_at, updated_at')
    .order('device_name')
    .returns<Device[]>()

  const health = buildHealth(ds, now)
  const attention = health.filter((h) => h.attention)
  const dupes = duplicateIds(devices ?? [])
  const totals = {
    stale: health.reduce((s, h) => s + h.staleVideos, 0),
    negative: health.reduce((s, h) => s + h.negativeGainVideos, 0),
    zero: health.reduce((s, h) => s + h.zeroViewVideos, 0),
  }

  return (
    <div>
      <PageHeader title="Sync health" subtitle="Is every account updating? Token problems, stale videos and device status in one place." />

      {attention.length > 0 ? (
        <div className="mb-5 rounded-lg border border-amber-900 bg-amber-950/30 p-4 text-sm text-amber-200">
          <p className="font-medium">{attention.length} {attention.length === 1 ? 'account needs' : 'accounts need'} attention</p>
          <ul className="mt-2 space-y-0.5 text-amber-300/90">
            {attention.map((h) => (
              <li key={h.connectionId}>
                {h.avatarName} · {PLATFORM_DISPLAY_NAME[h.platform as PlatformName]} —{' '}
                {h.attention === 'needs_reconnect' ? 'sign-in expired. Open the phone app on that avatar\'s device and reconnect the account. (If the Google OAuth app is in "Testing" status, tokens expire every 7 days: move it to Production.)' : h.attention === 'never' ? 'never synced' : 'no update in over 24 hours'}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-5 rounded-lg border border-green-900 bg-green-950/30 p-4 text-sm text-green-300">Every connected account has updated in the last 24 hours.</div>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Stale videos (no update in 36 h)</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtInt(totals.stale)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Videos with negative gains</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtInt(totals.negative)}</p>
          <p className="text-xs text-neutral-600">Platform removed views or likes; shown as 0 in charts.</p>
        </div>
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-xs text-neutral-500">Videos at 0 views after 48 h</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{fmtInt(totals.zero)}</p>
          <p className="text-xs text-neutral-600">Sync lag or a real problem.</p>
        </div>
      </div>

      <Card title="Account sync" className="mb-6">
        {health.length === 0 ? (
          <Empty>No connected accounts.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Avatar</th>
                  <th className="px-3 py-2 font-medium">Platform</th>
                  <th className="px-3 py-2 font-medium">Last sync</th>
                  <th className="px-3 py-2 font-medium">Token</th>
                  <th className="px-3 py-2 text-right font-medium">Videos</th>
                  <th className="px-3 py-2 text-right font-medium">Stale</th>
                  <th className="px-3 py-2 text-right font-medium">Negative gains</th>
                  <th className="px-3 py-2 text-right font-medium">0 views</th>
                  <th className="px-3 py-2 font-medium">Last error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {health.map((h) => {
                  const [label, tone] = TOKEN_LABEL[h.tokenState]
                  return (
                    <tr key={h.connectionId}>
                      <td className="px-3 py-2.5 text-neutral-200">{h.avatarName}</td>
                      <td className="px-3 py-2.5 text-neutral-400">{PLATFORM_DISPLAY_NAME[h.platform as PlatformName]}</td>
                      <td className="px-3 py-2.5 text-neutral-400">{h.lastSyncMs === null ? 'never' : timeAgo(new Date(h.lastSyncMs).toISOString(), now)}</td>
                      <td className="px-3 py-2.5"><Badge tone={tone}>{label}</Badge></td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{h.videos}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{h.staleVideos}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{h.negativeGainVideos}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{h.zeroViewVideos}</td>
                      <td className="max-w-xs px-3 py-2.5 text-xs text-red-400">{h.lastError ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Devices">
        {!devices || devices.length === 0 ? (
          <Empty>No devices registered.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-neutral-400">
                <tr>
                  <th className="px-3 py-2 font-medium">Device</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">App version</th>
                  <th className="px-3 py-2 font-medium">Last seen</th>
                  <th className="px-3 py-2 font-medium">Last sync</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {devices.map((d) => {
                  const st = effectiveStatus(d, now)
                  return (
                    <tr key={d.id}>
                      <td className="px-3 py-2.5 text-neutral-200">
                        {d.device_name}
                        {dupes.has(d.id) && <span className="ml-2 rounded-full border border-amber-800 px-1.5 text-[10px] text-amber-300">duplicate?</span>}
                        <div className="text-xs text-neutral-500">{d.device_model}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[st]}`} />
                          {st}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-400">{d.app_version_name ?? '—'}</td>
                      <td className="px-3 py-2.5 text-neutral-400">{timeAgo(d.last_seen_at, now)}</td>
                      <td className="px-3 py-2.5 text-neutral-400">{timeAgo(d.last_sync_at, now)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}

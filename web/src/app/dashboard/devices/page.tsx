import { createClient } from '@/lib/supabase/server'
import type { Device } from '@/types/database'
import { nowMs } from '@/lib/filters'

type EffectiveStatus = Device['status'] | 'idle'

const STATUS_DOT: Record<EffectiveStatus, string> = {
  online: 'bg-green-500',
  syncing: 'bg-blue-500',
  idle: 'bg-amber-500',
  offline: 'bg-neutral-500',
  error: 'bg-red-500',
  disabled: 'bg-neutral-700',
}

// The stored status is whatever the phone last reported, so a phone that stopped checking in stays
// "online" forever. Derive it from last_seen_at instead: online < 15 min, idle < 24 h, else offline.
function effectiveStatus(device: Device, nowMs: number): EffectiveStatus {
  if (device.status === 'disabled' || device.status === 'error') return device.status
  if (!device.last_seen_at) return 'offline'
  const age = nowMs - new Date(device.last_seen_at).getTime()
  if (age < 15 * 60 * 1000) return device.status === 'syncing' ? 'syncing' : 'online'
  if (age < 24 * 60 * 60 * 1000) return 'idle'
  return 'offline'
}

function timeAgo(iso: string | null) {
  if (!iso) return 'never'
  const diffMs = nowMs() - new Date(iso).getTime()
  const diffSec = Math.max(0, Math.floor(diffMs / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

export default async function DevicesPage() {
  const supabase = await createClient()
  const { data: devices, error } = await supabase
    .from('devices')
    .select(
      'id, device_uuid, device_name, status, app_version_name, android_version, device_model, last_seen_at, last_sync_at, created_at, updated_at'
    )
    .order('device_name')
    .returns<Device[]>()

  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">
        Failed to load devices: {error.message}
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Devices</h1>
      {!devices || devices.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-400">
          No devices registered yet — install the Android app and open it to register the first one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-900 text-neutral-400">
              <tr>
                <th className="px-4 py-2 font-medium">Device</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">App version</th>
                <th className="px-4 py-2 font-medium">Android</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                <th className="px-4 py-2 font-medium">Last sync</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800">
              {devices.map((device) => {
                const status = effectiveStatus(device, nowMs())
                return (
                <tr key={device.id}>
                  <td className="px-4 py-3 text-neutral-100">
                    {device.device_name}
                    <div className="text-xs text-neutral-500">{device.device_model}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                      {status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{device.app_version_name ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-400">{device.android_version ?? '—'}</td>
                  <td className="px-4 py-3 text-neutral-400">{timeAgo(device.last_seen_at)}</td>
                  <td className="px-4 py-3 text-neutral-400">{timeAgo(device.last_sync_at)}</td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

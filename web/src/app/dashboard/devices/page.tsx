import { createClient } from '@/lib/supabase/server'
import type { Device } from '@/types/database'
import { nowMs } from '@/lib/filters'
import { STATUS_DOT, duplicateIds, effectiveStatus, timeAgo } from '@/lib/devices'

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

  const now = nowMs()
  const dupes = duplicateIds(devices ?? [])

  return (
    <div>
      <h1 className="mb-1 text-lg font-semibold">Devices</h1>
      <p className="mb-6 text-sm text-neutral-500">Status comes from last seen: online under 15 minutes, idle under 24 hours, offline after that.</p>
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
                const status = effectiveStatus(device, now)
                return (
                  <tr key={device.id}>
                    <td className="px-4 py-3 text-neutral-100">
                      {device.device_name}
                      {dupes.has(device.id) && <span className="ml-2 rounded-full border border-amber-800 px-1.5 text-[10px] text-amber-300">duplicate?</span>}
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
                    <td className="px-4 py-3 text-neutral-400">{timeAgo(device.last_seen_at, now)}</td>
                    <td className="px-4 py-3 text-neutral-400">{timeAgo(device.last_sync_at, now)}</td>
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

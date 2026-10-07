import type { Device } from '@/types/database'

export type EffectiveStatus = Device['status'] | 'idle'

// The stored status is whatever the phone last reported, so a phone that stopped checking in stays
// "online" forever. Derive it from last_seen_at instead: online < 15 min, idle < 24 h, else offline.
export function effectiveStatus(device: Device, nowMs: number): EffectiveStatus {
  if (device.status === 'disabled' || device.status === 'error') return device.status
  if (!device.last_seen_at) return 'offline'
  const age = nowMs - new Date(device.last_seen_at).getTime()
  if (age < 15 * 60 * 1000) return device.status === 'syncing' ? 'syncing' : 'online'
  if (age < 24 * 60 * 60 * 1000) return 'idle'
  return 'offline'
}

export const STATUS_DOT: Record<EffectiveStatus, string> = {
  online: 'bg-green-500',
  syncing: 'bg-blue-500',
  idle: 'bg-amber-500',
  offline: 'bg-neutral-500',
  error: 'bg-red-500',
  disabled: 'bg-neutral-700',
}

export function timeAgo(iso: string | null, nowMs: number): string {
  if (!iso) return 'never'
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

// Devices with the same name and model are almost certainly the same phone registered twice.
export function duplicateIds(devices: Device[]): Set<string> {
  const seen = new Map<string, Device[]>()
  for (const d of devices) {
    const k = `${d.device_name}|${d.device_model}`
    seen.set(k, [...(seen.get(k) ?? []), d])
  }
  const dupes = new Set<string>()
  for (const list of seen.values()) if (list.length > 1) for (const d of list) dupes.add(d.id)
  return dupes
}

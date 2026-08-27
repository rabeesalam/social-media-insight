import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Avatar, Device } from '@/types/database'

export default async function DashboardHomePage() {
  const supabase = await createClient()

  const { data: avatars, error } = await supabase
    .from('avatars')
    .select('id, device_id, name, handle, profile_image_url, created_at, updated_at')
    .order('name')
    .returns<Avatar[]>()

  const { data: devices } = await supabase
    .from('devices')
    .select('id, device_name, status')
    .returns<Pick<Device, 'id' | 'device_name' | 'status'>[]>()

  const deviceNameById = new Map((devices ?? []).map((d) => [d.id, d.device_name]))

  if (error) {
    return (
      <div className="rounded-lg border border-red-900 bg-red-950/40 p-4 text-red-300">
        Failed to load avatars: {error.message}
      </div>
    )
  }

  if (!avatars || avatars.length === 0) {
    return (
      <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-400">
        <p className="mb-1 text-neutral-200">No avatars yet</p>
        <p className="text-sm">
          Avatars are created from the Android app once a device is registered and configured.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-6 text-lg font-semibold">Avatars</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {avatars.map((avatar) => (
          <Link
            key={avatar.id}
            href={`/dashboard/avatars/${avatar.id}`}
            className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
          >
            <p className="font-medium text-neutral-100">{avatar.name}</p>
            {avatar.handle && <p className="text-sm text-neutral-500">@{avatar.handle}</p>}
            <p className="mt-2 text-xs text-neutral-500">
              {deviceNameById.get(avatar.device_id) ?? 'Unknown device'}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import type { Avatar, Device, PlatformConnectionSafe } from '@/types/database'
import { latestFollowersByConnection } from '@/lib/followers'
import { PLATFORM_SHORT_NAME } from '@/lib/platforms'

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)
}

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

  const { data: connections } = await supabase
    .from('platform_connections_safe')
    .select('id, avatar_id, platform')
    .returns<Pick<PlatformConnectionSafe, 'id' | 'avatar_id' | 'platform'>[]>()

  const deviceNameById = new Map((devices ?? []).map((d) => [d.id, d.device_name]))
  const connectionsByAvatar = new Map<string, Pick<PlatformConnectionSafe, 'id' | 'avatar_id' | 'platform'>[]>()
  for (const c of connections ?? []) {
    if (!connectionsByAvatar.has(c.avatar_id)) connectionsByAvatar.set(c.avatar_id, [])
    connectionsByAvatar.get(c.avatar_id)!.push(c)
  }

  const followersByConnection = await latestFollowersByConnection(
    supabase,
    (connections ?? []).map((c) => c.id)
  )

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
        {avatars.map((avatar) => {
          const avatarConnections = connectionsByAvatar.get(avatar.id) ?? []
          return (
            <div
              key={avatar.id}
              className="rounded-lg border border-neutral-800 bg-neutral-900 p-4 transition hover:border-neutral-600"
            >
              <Link href={`/dashboard/avatars/${avatar.id}`}>
                <p className="font-medium text-neutral-100">{avatar.name}</p>
                {avatar.handle && <p className="text-sm text-neutral-500">@{avatar.handle}</p>}
                <p className="mt-2 text-xs text-neutral-500">
                  {deviceNameById.get(avatar.device_id) ?? 'Unknown device'}
                </p>
              </Link>
              {avatarConnections.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  {avatarConnections.map((c) => {
                    const followers = followersByConnection.get(c.id)
                    return (
                      <Link
                        key={c.id}
                        href={`/dashboard/avatars/${avatar.id}?platform=${c.platform}`}
                        className="text-sm text-neutral-300 hover:text-neutral-100 hover:underline"
                      >
                        <span className="font-semibold tabular-nums">
                          {followers == null ? '—' : fmt(followers)}
                        </span>
                        <sub className="ml-0.5 text-neutral-500">{PLATFORM_SHORT_NAME[c.platform]}</sub>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

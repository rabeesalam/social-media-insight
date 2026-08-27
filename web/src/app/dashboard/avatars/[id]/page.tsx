import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Avatar, MetricSnapshot, PlatformConnectionSafe, PlatformContent } from '@/types/database'
import { ContentTable } from '@/components/ContentTable'
import { DeleteAvatarButton } from '@/components/DeleteAvatarButton'
import { ALL_PLATFORMS, PLATFORM_DISPLAY_NAME } from '@/lib/platforms'

const STATUS_LABEL: Record<string, string> = {
  connected: 'Connected',
  reauthorization_required: 'Needs reauthorization',
  error: 'Error',
  disabled: 'Disabled',
  pending: 'Connecting…',
}

const STATUS_DOT: Record<string, string> = {
  connected: 'bg-green-500',
  reauthorization_required: 'bg-yellow-500',
  error: 'bg-red-500',
  disabled: 'bg-neutral-700',
  pending: 'bg-blue-500',
}

export default async function AvatarDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: avatar } = await supabase
    .from('avatars')
    .select('id, device_id, name, handle, profile_image_url, created_at, updated_at')
    .eq('id', id)
    .single<Avatar>()

  if (!avatar) notFound()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('role').eq('id', user.id).single<{ role: string }>()
    : { data: null }
  const isAdmin = profile?.role === 'admin'

  const { data: connections } = await supabase
    .from('platform_connections_safe')
    .select('*')
    .eq('avatar_id', id)
    .returns<PlatformConnectionSafe[]>()

  const connectionByPlatform = new Map((connections ?? []).map((c) => [c.platform, c]))
  const connectionIds = (connections ?? []).map((c) => c.id)

  let content: PlatformContent[] = []
  let latestByContentId = new Map<string, MetricSnapshot>()

  if (connectionIds.length > 0) {
    const { data: contentRows } = await supabase
      .from('platform_content')
      .select('*')
      .in('platform_connection_id', connectionIds)
      .order('published_at', { ascending: false })
      .returns<PlatformContent[]>()
    content = contentRows ?? []

    if (content.length > 0) {
      const { data: snapshots } = await supabase
        .from('latest_metric_snapshots')
        .select('*')
        .in('platform_content_id', content.map((c) => c.id))
        .returns<MetricSnapshot[]>()
      latestByContentId = new Map((snapshots ?? []).map((s) => [s.platform_content_id, s]))
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-100">
            ← Avatars
          </Link>
          <h1 className="mt-1 text-lg font-semibold">{avatar.name}</h1>
        </div>
        {isAdmin && <DeleteAvatarButton avatarId={avatar.id} avatarName={avatar.name} />}
      </div>

      <h2 className="mb-3 text-sm font-medium text-neutral-400">Platform connections</h2>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ALL_PLATFORMS.map((platform) => {
          const connection = connectionByPlatform.get(platform)
          const status = connection?.status
          return (
            <div key={platform} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{PLATFORM_DISPLAY_NAME[platform]}</span>
                {status ? (
                  <span className="inline-flex items-center gap-1.5 text-xs text-neutral-400">
                    <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />
                    {STATUS_LABEL[status] ?? status}
                  </span>
                ) : (
                  <span className="text-xs text-neutral-500">Not connected</span>
                )}
              </div>
              {connection?.username && <p className="mt-1 text-xs text-neutral-500">@{connection.username}</p>}
              {connection?.last_error && (
                <p className="mt-2 text-xs text-red-400">{connection.last_error}</p>
              )}
            </div>
          )
        })}
      </div>

      <h2 className="mb-3 text-sm font-medium text-neutral-400">Content</h2>
      <ContentTable content={content} latestByContentId={latestByContentId} />
    </div>
  )
}

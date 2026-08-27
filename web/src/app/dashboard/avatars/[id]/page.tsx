import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Avatar, MetricSnapshot, PlatformConnectionSafe, PlatformContent, PlatformName } from '@/types/database'
import { ContentTable } from '@/components/ContentTable'
import { DeleteAvatarButton } from '@/components/DeleteAvatarButton'
import { ALL_PLATFORMS, PLATFORM_DISPLAY_NAME, PLATFORM_FOLLOWER_LABEL } from '@/lib/platforms'
import { latestFollowersByConnection } from '@/lib/followers'
import { PERIOD_LABEL, periodCutoffMs, type Period } from '@/lib/insights'

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

const PERIODS: Period[] = ['weekly', 'monthly', 'all']

export default async function AvatarDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ platform?: string; period?: string }>
}) {
  const { id } = await params
  const { platform: platformParam, period: periodParam } = await searchParams
  const platformFilter: PlatformName | null = ALL_PLATFORMS.includes(platformParam as PlatformName)
    ? (platformParam as PlatformName)
    : null
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : 'all'

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
  const followersByConnection = await latestFollowersByConnection(supabase, connectionIds)

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

  const periodCutoff = periodCutoffMs(period)

  const filteredContent = content.filter((item) => {
    if (platformFilter && item.platform !== platformFilter) return false
    if (periodCutoff !== null) {
      if (!item.published_at) return false
      if (new Date(item.published_at).getTime() < periodCutoff) return false
    }
    return true
  })

  // Always show every platform card, even while filtered — otherwise switching to another
  // connected platform means hitting "back" first, which defeats the point of the cards being
  // links in the first place.
  const platformsToShow = ALL_PLATFORMS
  const basePath = `/dashboard/avatars/${id}`

  function pageHref(overrides: { platform?: string | null; period?: string }) {
    const params = new URLSearchParams()
    const p = overrides.platform !== undefined ? overrides.platform : platformFilter
    const per = overrides.period !== undefined ? overrides.period : period
    if (p) params.set('platform', p)
    if (per && per !== 'all') params.set('period', per)
    const qs = params.toString()
    return qs ? `${basePath}?${qs}` : basePath
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

      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-400">Platform connections</h2>
        {platformFilter && (
          <Link href={pageHref({ platform: null })} className="text-sm text-neutral-400 hover:text-neutral-100">
            Show all platforms ×
          </Link>
        )}
      </div>
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {platformsToShow.map((platform) => {
          const connection = connectionByPlatform.get(platform)
          const status = connection?.status
          const isActive = platformFilter === platform
          return (
            <Link
              key={platform}
              href={pageHref({ platform: isActive ? null : platform })}
              className={`rounded-lg border p-4 transition ${
                isActive
                  ? 'border-neutral-500 bg-neutral-800'
                  : 'border-neutral-800 bg-neutral-900 hover:border-neutral-600'
              }`}
            >
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
              {connection && (() => {
                const followers = followersByConnection.get(connection.id)
                return followers !== undefined ? (
                  <p className="mt-2 text-sm">
                    <span className="font-semibold tabular-nums text-neutral-100">
                      {followers === null ? '—' : new Intl.NumberFormat('en-US', { notation: followers >= 10000 ? 'compact' : 'standard' }).format(followers)}
                    </span>{' '}
                    <span className="text-xs text-neutral-500">{PLATFORM_FOLLOWER_LABEL[platform]}</span>
                  </p>
                ) : null
              })()}
              {connection?.last_error && (
                <p className="mt-2 text-xs text-red-400">{connection.last_error}</p>
              )}
            </Link>
          )
        })}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-neutral-400">Content</h2>
        <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={pageHref({ period: p })}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
                p === period ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:text-neutral-100'
              }`}
            >
              {PERIOD_LABEL[p]}
            </Link>
          ))}
        </div>
      </div>
      <ContentTable content={filteredContent} latestByContentId={latestByContentId} />
    </div>
  )
}

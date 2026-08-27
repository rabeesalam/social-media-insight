import type { PlatformName } from '@/types/database'

export const ALL_PLATFORMS: PlatformName[] = ['instagram', 'tiktok', 'youtube', 'facebook', 'threads', 'x']

export const PLATFORM_DISPLAY_NAME: Record<PlatformName, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X',
}

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

// Short form used next to a follower count, e.g. "47" + subscript "insta" — kept lowercase since
// it's rendered as a small subscript label, not a heading.
export const PLATFORM_SHORT_NAME: Record<PlatformName, string> = {
  instagram: 'insta',
  tiktok: 'tiktok',
  youtube: 'yt',
  facebook: 'fb',
  threads: 'threads',
  x: 'x',
}

// YouTube calls them subscribers, not followers — every other platform here uses "followers".
export const PLATFORM_FOLLOWER_LABEL: Record<PlatformName, string> = {
  instagram: 'followers',
  tiktok: 'followers',
  youtube: 'subscribers',
  facebook: 'followers',
  threads: 'followers',
  x: 'followers',
}

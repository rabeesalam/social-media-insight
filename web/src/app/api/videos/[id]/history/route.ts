import { withScope } from '@/lib/api'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { summarize, typicalCurve, videoProjection } from '@/lib/videoDetail'
import { findCrossPosts } from '@/lib/videos'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withScope(request, (sc) => {
    const v = sc.ds.videos.find((x) => x.id === id)
    if (!v) return { error: 'not found' }
    const f = sc.filters
    const sum = summarize(v, sc.now, f.breakoutMult, f.breakoutFloor)
    const siblings = findCrossPosts(sc.ds.videos.filter((x) => x.avatarId === v.avatarId))
      .filter((p) => p.a.id === v.id || p.b.id === v.id)
      .map((p) => (p.a.id === v.id ? p.b : p.a))
    return {
      id: v.id,
      title: v.title,
      platform: v.platform,
      publishedAt: v.publishedAt === null ? null : new Date(v.publishedAt).toISOString(),
      snapshots: v.snaps.map((s) => ({ capturedAt: new Date(s.t).toISOString(), views: s.views, likes: s.likes, comments: s.comments, shares: s.shares, saves: s.saves })),
      daily: sum.daily.map((d) => ({ date: d.day, viewsGained: Math.round(d.gain), lifetimeViews: d.lifetime, estimated: d.est, breakout: d.isBreakout })),
      biggestDay: sum.biggest ? { date: sum.biggest.day, viewsGained: Math.round(sum.biggest.gain), estimated: sum.biggest.est } : null,
      daysToPeak: sum.daysToPeak,
      first48hSharePct: sum.first48hShare,
      typicalCurve: typicalCurve(v, sc.ds.videos, 30).rows,
      projection: videoProjection(v, sc.ds.videos, f.projection || 30, sc.now),
      crossPosts: siblings.map((s) => ({ id: s.id, platform: PLATFORM_DISPLAY_NAME[s.platform], title: s.title })),
    }
  })
}

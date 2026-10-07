import { withScope } from '@/lib/api'
import { DAY_MS } from '@/lib/filters'
import { project } from '@/lib/projection'
import { addDays, dayKey, followerDaily } from '@/lib/series'

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  return withScope(request, (sc) => {
    const c = sc.ds.connections.find((x) => x.id === id)
    if (!c) return { error: 'not found' }
    const win = { startMs: sc.range.current.startMs || (c.snaps[0]?.t ?? sc.now - 90 * DAY_MS), endMs: sc.now }
    const daily = followerDaily([c], win)
    const days = Array.from(daily.keys()).sort()
    const proj = sc.filters.projection ? project(days.map((d) => daily.get(d)!.value), sc.filters.projection, true) : null
    return {
      id: c.id,
      platform: c.platform,
      daily: days.map((d) => ({ date: d, followers: daily.get(d)!.value, estimated: daily.get(d)!.est })),
      projection: proj ? proj.mid.map((m, i) => ({ date: addDays(days[days.length - 1] ?? dayKey(sc.now), i + 1), mid: Math.round(m), low: Math.round(proj.lo[i]), high: Math.round(proj.hi[i]) })) : null,
      projectionMethod: proj?.method ?? null,
    }
  })
}

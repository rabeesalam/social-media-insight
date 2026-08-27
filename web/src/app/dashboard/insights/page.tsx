import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getInsights, PERIOD_LABEL, type Period, type MetricTotals } from '@/lib/insights'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'

const PERIODS: Period[] = ['weekly', 'monthly', 'all']

function fmt(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: n >= 10000 ? 'compact' : 'standard' }).format(n)
}

function fmtRate(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(2)}%`
}

function MetricRow({ label, totals, emphasis }: { label: string; totals: MetricTotals; emphasis?: boolean }) {
  return (
    <tr className={emphasis ? 'bg-neutral-900/60' : undefined}>
      <td className={`px-3 py-2.5 ${emphasis ? 'font-semibold text-neutral-100' : 'text-neutral-300'}`}>{label}</td>
      <td className="px-3 py-2.5 text-right tabular-nums text-neutral-500">{totals.videoCount}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.views)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.likes)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.comments)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.shares)}</td>
      <td className="px-3 py-2.5 text-right tabular-nums">{fmt(totals.saves)}</td>
      <td className={`px-3 py-2.5 text-right tabular-nums ${emphasis ? 'font-semibold text-neutral-100' : ''}`}>
        {fmtRate(totals.engagementRate)}
      </td>
    </tr>
  )
}

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period: Period = PERIODS.includes(periodParam as Period) ? (periodParam as Period) : 'weekly'

  const supabase = await createClient()
  const insights = await getInsights(supabase, period)

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Insights</h1>
      </div>
      <p className="mb-5 max-w-2xl text-sm text-neutral-500">
        Every video's numbers, combined per platform and across all connected platforms. Views in
        particular aren&apos;t perfectly comparable between platforms (a YouTube view and an
        Instagram reach are counted differently) — the combined row is a ballpark total; use the
        per-platform rows for exact figures. Engagement rate = (likes + comments + shares + saves)
        ÷ views × 100, calculated across the whole group, not averaged per video.
      </p>

      <div className="mb-8 inline-flex rounded-lg border border-neutral-800 bg-neutral-900 p-1">
        {PERIODS.map((p) => (
          <Link
            key={p}
            href={`/dashboard/insights?period=${p}`}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              p === period ? 'bg-neutral-100 text-neutral-900' : 'text-neutral-400 hover:text-neutral-100'
            }`}
          >
            {PERIOD_LABEL[p]}
          </Link>
        ))}
      </div>

      {insights.length === 0 ? (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-400">
          No avatars yet.
        </div>
      ) : (
        <div className="space-y-10">
          {insights.map((avatar) => (
            <div key={avatar.avatarId}>
              <div className="mb-3 flex items-center justify-between">
                <Link href={`/dashboard/avatars/${avatar.avatarId}`} className="text-base font-semibold hover:underline">
                  {avatar.avatarName}
                </Link>
              </div>

              {/* Followers — always the latest known value, independent of the period tab above. */}
              {avatar.followers.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {avatar.followers.map((f) => (
                    <div
                      key={f.platform}
                      className="flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm"
                    >
                      <span className="text-neutral-500">{PLATFORM_DISPLAY_NAME[f.platform]}</span>
                      <span className="font-semibold tabular-nums text-neutral-100">
                        {f.followers === null ? '—' : fmt(f.followers)}
                      </span>
                      <span className="text-xs text-neutral-600">followers</span>
                    </div>
                  ))}
                </div>
              )}

              {avatar.perPlatform.length === 0 ? (
                <p className="text-sm text-neutral-600">No content synced for this period yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-neutral-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-900 text-neutral-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Platform</th>
                        <th className="px-3 py-2 text-right font-medium">Videos</th>
                        <th className="px-3 py-2 text-right font-medium">Views</th>
                        <th className="px-3 py-2 text-right font-medium">Likes</th>
                        <th className="px-3 py-2 text-right font-medium">Comments</th>
                        <th className="px-3 py-2 text-right font-medium">Shares</th>
                        <th className="px-3 py-2 text-right font-medium">Saves</th>
                        <th className="px-3 py-2 text-right font-medium">Engagement</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {avatar.perPlatform.map((p) => (
                        <MetricRow key={p.platform} label={PLATFORM_DISPLAY_NAME[p.platform]} totals={p} />
                      ))}
                      <MetricRow label="Combined — all platforms" totals={avatar.combined} emphasis />
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

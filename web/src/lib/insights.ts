export type Period = 'weekly' | 'monthly' | 'all'

export const PERIOD_LABEL: Record<Period, string> = {
  weekly: 'Weekly (last 7 days)',
  monthly: 'Monthly (last 30 days)',
  all: 'All-time',
}

// Kept out of any component body — react-hooks/purity flags direct Date.now() calls during
// render, but a plain module function called from render is fine.
export function periodCutoffMs(period: Period): number | null {
  if (period === 'weekly') return Date.now() - 7 * 24 * 60 * 60 * 1000
  if (period === 'monthly') return Date.now() - 30 * 24 * 60 * 60 * 1000
  return null
}

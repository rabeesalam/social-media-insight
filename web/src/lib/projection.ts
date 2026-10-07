// Simple, explainable projections (spec section 9). Always shown as a dashed line with a range band,
// and only when there is enough history.

export interface Projected {
  mid: number[]
  lo: number[]
  hi: number[]
  method: 'linear' | 'holt'
}

export const MIN_HISTORY_DAYS = 14

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)))
  return sorted[idx]
}

// Viral days distort trends, so cap any single day at the series' 95th percentile before fitting.
export function capAtP95(values: number[]): number[] {
  const cap = percentile([...values].sort((a, b) => a - b), 0.95)
  return values.map((v) => Math.min(v, cap))
}

function linearFit(y: number[]): { slope: number; intercept: number; fitted: number[] } {
  const n = y.length
  const xs = y.map((_, i) => i)
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = y.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (y[i] - my)
    den += (xs[i] - mx) ** 2
  }
  const slope = den === 0 ? 0 : num / den
  const intercept = my - slope * mx
  return { slope, intercept, fitted: xs.map((x) => intercept + slope * x) }
}

function holt(y: number[], alpha = 0.5, beta = 0.3): { level: number; trend: number; fitted: number[] } {
  let level = y[0]
  let trend = y.length > 1 ? y[1] - y[0] : 0
  const fitted = [y[0]]
  for (let i = 1; i < y.length; i++) {
    const pred = level + trend
    fitted.push(pred)
    const newLevel = alpha * y[i] + (1 - alpha) * pred
    trend = beta * (newLevel - level) + (1 - beta) * trend
    level = newLevel
  }
  return { level, trend, fitted }
}

function rmse(a: number[], b: number[]): number {
  let s = 0
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2
  return Math.sqrt(s / Math.max(1, a.length))
}

/** Project `horizon` steps past the end of `values` (most recent last). Uses the last 28 values. */
export function project(values: number[], horizon: number, nonNegative = false): Projected | null {
  const y = values.slice(-28)
  if (y.length < MIN_HISTORY_DAYS) return null
  const lin = linearFit(y)
  const h = holt(y)
  const linErr = rmse(y, lin.fitted)
  const holtErr = rmse(y, h.fitted)
  const useHolt = holtErr < linErr * 0.9
  const err = useHolt ? holtErr : linErr
  const z = 1.2816 // 80% band
  const mid: number[] = []
  const lo: number[] = []
  const hi: number[] = []
  const clamp = (v: number) => (nonNegative ? Math.max(0, v) : v)
  for (let k = 1; k <= horizon; k++) {
    const m = useHolt ? h.level + h.trend * k : lin.intercept + lin.slope * (y.length - 1 + k)
    const spread = z * err * Math.sqrt(1 + k / y.length)
    mid.push(clamp(m))
    lo.push(clamp(m - spread))
    hi.push(clamp(m + spread))
  }
  return { mid, lo, hi, method: useHolt ? 'holt' : 'linear' }
}

const MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000, 1000000]

/** Next round milestone above the current value and the days until the projected line crosses it. */
export function milestoneEta(current: number, dailyGain: number): { milestone: number; days: number | null } | null {
  const milestone = MILESTONES.find((m) => m > current)
  if (!milestone) return null
  if (dailyGain <= 0) return { milestone, days: null }
  return { milestone, days: Math.ceil((milestone - current) / dailyGain) }
}

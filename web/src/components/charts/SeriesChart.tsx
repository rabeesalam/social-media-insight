'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartRow, ChartSeries, Spike } from '@/lib/series'

export type SeriesKind = 'line' | 'area' | 'bar' | 'stackedPct' | 'stackedBar'

const axisNum = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const exact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

function xLabel(x: string): string {
  // YYYY-MM-DD -> "Oct 7"; YYYY-MM -> "Oct 2026"
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) {
    const [y, m, d] = x.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  }
  if (/^\d{4}-\d{2}$/.test(x)) {
    const [y, m] = x.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
  }
  return x
}

const GRID = '#262626'
const AXIS = '#737373'

type DotProps = { cx?: number; cy?: number; payload?: ChartRow; stroke?: string }

export function SeriesChart({
  rows,
  series,
  kind = 'line',
  log = false,
  spikes = [],
  height = 300,
  yFormat = 'number',
  xIsDate = true,
  yMax,
}: {
  rows: ChartRow[]
  series: ChartSeries[]
  kind?: SeriesKind
  log?: boolean
  spikes?: Spike[]
  height?: number
  yFormat?: 'number' | 'percent'
  xIsDate?: boolean
  yMax?: number
}) {
  const tick = (v: number) => (yFormat === 'percent' ? `${Math.round(v * (kind === 'stackedPct' ? 100 : 1))}%` : axisNum.format(v))
  const tip = (v: unknown) => (typeof v === 'number' ? (yFormat === 'percent' ? `${exact.format(v)}%` : exact.format(v)) : '—')
  const fmtX = xIsDate ? xLabel : (x: string) => x

  const common = {
    data: rows,
    margin: { top: 8, right: 12, left: 0, bottom: 0 },
  }
  const axes = (
    <>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey="x" tickFormatter={fmtX} stroke={AXIS} fontSize={12} tickLine={false} minTickGap={24} />
      <YAxis
        stroke={AXIS}
        fontSize={12}
        tickLine={false}
        axisLine={false}
        width={52}
        tickFormatter={tick}
        scale={log && kind !== 'stackedPct' ? 'symlog' : 'auto'}
        domain={kind === 'stackedPct' ? [0, 1] : yMax !== undefined ? [0, yMax] : undefined}
      />
      <Tooltip
        contentStyle={{ background: '#171717', border: '1px solid #404040', borderRadius: 8, fontSize: 12 }}
        labelFormatter={(l) => fmtX(String(l))}
        formatter={(v) => (kind === 'stackedPct' ? tip(v) : tip(v))}
      />
      {series.length > 1 && height > 200 && <Legend wrapperStyle={{ fontSize: 12 }} />}
    </>
  )

  const hollowDot = (s: ChartSeries) => {
    const Dot = (p: DotProps) => {
      if (p.cx === undefined || p.cy === undefined || !p.payload) return <g />
      const est = p.payload[`${s.key}__est`] === true
      return <circle cx={p.cx} cy={p.cy} r={3} fill={est ? '#0a0a0a' : s.color} stroke={s.color} strokeWidth={1.5} />
    }
    return Dot
  }

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {kind === 'bar' || kind === 'stackedBar' ? (
          <BarChart {...common}>
            {axes}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={kind === 'stackedBar' ? 'a' : undefined} radius={kind === 'bar' ? [2, 2, 0, 0] : 0} />
            ))}
          </BarChart>
        ) : kind === 'area' || kind === 'stackedPct' ? (
          <AreaChart {...common} stackOffset={kind === 'stackedPct' ? 'expand' : undefined}>
            {axes}
            {series.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                fill={s.color}
                fillOpacity={kind === 'stackedPct' ? 0.6 : 0.2}
                stackId={kind === 'stackedPct' ? 'a' : undefined}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                connectNulls
              />
            ))}
          </AreaChart>
        ) : (
          <LineChart {...common}>
            {axes}
            {series.map((s) => (
              <Line
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stroke={s.color}
                strokeWidth={s.dashed ? 1.5 : 2}
                strokeDasharray={s.dashed ? '5 4' : undefined}
                dot={s.dashed ? false : hollowDot(s)}
                connectNulls
                isAnimationActive={false}
              />
            ))}
            {spikes.map((sp, i) => (
              <ReferenceDot key={i} x={sp.x} y={sp.y} r={6} fill="#f59e0b" stroke="#fff" ifOverflow="extendDomain" />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}

'use client'

import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'

export interface Dot {
  x: number
  y: number
  z?: number
  color: string
  label: string
  href?: string
}

const axisNum = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })
const exact = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

export function ScatterPlot({
  dots,
  xLabel,
  yLabel,
  xIsDate = false,
  logY = false,
  xLine,
  yLine,
  yLineLabel,
  height = 340,
  legend = [],
}: {
  dots: Dot[]
  xLabel: string
  yLabel: string
  xIsDate?: boolean
  logY?: boolean
  xLine?: number
  yLine?: number
  yLineLabel?: string
  height?: number
  legend?: { name: string; color: string }[]
}) {
  const colors = Array.from(new Set(dots.map((d) => d.color)))
  const fmtX = (v: number) =>
    xIsDate ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : axisNum.format(v)
  return (
    <div>
      <div style={{ height }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 16 }}>
            <CartesianGrid stroke="#262626" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              domain={['dataMin', 'dataMax']}
              tickFormatter={fmtX}
              stroke="#737373"
              fontSize={12}
              label={{ value: xLabel, position: 'insideBottom', offset: -8, fill: '#737373', fontSize: 12 }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              scale={logY ? 'symlog' : 'auto'}
              tickFormatter={(v: number) => axisNum.format(v)}
              stroke="#737373"
              fontSize={12}
              width={56}
            />
            <ZAxis type="number" dataKey="z" range={[30, 220]} />
            {xLine !== undefined && <ReferenceLine x={xLine} stroke="#525252" strokeDasharray="4 4" />}
            {yLine !== undefined && (
              <ReferenceLine y={yLine} stroke="#f59e0b" strokeDasharray="4 4" label={{ value: yLineLabel, fill: '#f59e0b', fontSize: 11, position: 'insideTopRight' }} />
            )}
            <Tooltip
              cursor={{ strokeDasharray: '3 3' }}
              content={({ payload }) => {
                const p = payload?.[0]?.payload as Dot | undefined
                if (!p) return null
                return (
                  <div className="max-w-xs rounded-md border border-neutral-700 bg-neutral-900 p-2 text-xs">
                    <p className="line-clamp-3 text-neutral-200">{p.label}</p>
                    <p className="mt-1 text-neutral-400">
                      {xLabel}: {xIsDate ? fmtX(p.x) : exact.format(p.x)} · {yLabel}: {exact.format(p.y)}
                      {p.z !== undefined && ` · ${exact.format(p.z)}`}
                    </p>
                    {p.href && <p className="mt-1 text-sky-400">Click the dot to open this video</p>}
                  </div>
                )
              }}
            />
            {colors.map((c) => (
              <Scatter
                key={c}
                data={dots.filter((d) => d.color === c)}
                fill={c}
                fillOpacity={0.75}
                isAnimationActive={false}
                onClick={(d: unknown) => {
                  const href = (d as { href?: string } | undefined)?.href
                  if (href) window.location.assign(href)
                }}
                cursor="pointer"
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {legend.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-neutral-400">
          {legend.map((l) => (
            <span key={l.name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
              {l.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

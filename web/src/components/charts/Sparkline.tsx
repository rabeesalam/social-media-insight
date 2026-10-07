export function Sparkline({ values, color = '#a3a3a3', width = 90, height = 24 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2 || values.every((v) => v === 0)) {
    return <span className="text-xs text-neutral-700">—</span>
  }
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  const step = width / (values.length - 1)
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(' ')
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="trend">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

// Server-rendered grid heatmap: rows x columns, each cell shaded by value on a log-ish scale.
export interface HeatCell {
  value: number | null
  label?: string
  title?: string
}

export function Heatmap({
  rows,
  cols,
  cells,
  format,
  rowHeader,
  small = false,
}: {
  rows: string[]
  cols: string[]
  cells: HeatCell[][]
  format: (v: number) => string
  rowHeader?: string
  small?: boolean
}) {
  const vals = cells.flat().map((c) => c.value).filter((v): v is number => v !== null && v > 0)
  const max = vals.length ? Math.max(...vals) : 1
  const shade = (v: number | null) => {
    if (v === null) return 'transparent'
    if (v <= 0) return 'rgba(56,189,248,0.04)'
    const t = Math.log1p(v) / Math.log1p(max)
    return `rgba(56,189,248,${(0.12 + t * 0.7).toFixed(2)})`
  }
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left font-medium text-neutral-500">{rowHeader}</th>
            {cols.map((c) => (
              <th key={c} className="px-2 py-1 text-center font-medium text-neutral-500">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r}>
              <th className="whitespace-nowrap px-2 py-1 text-left font-medium text-neutral-300">{r}</th>
              {cells[i].map((cell, j) => (
                <td
                  key={j}
                  title={cell.title ?? (cell.value === null ? 'no data' : format(cell.value))}
                  className={`rounded text-center tabular-nums text-neutral-100 ${small ? 'h-5 w-5 min-w-5 text-[10px]' : 'h-9 min-w-16 px-2'}`}
                  style={{ background: shade(cell.value) }}
                >
                  {small ? '' : cell.value === null ? <span className="text-neutral-700">—</span> : (cell.label ?? format(cell.value))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

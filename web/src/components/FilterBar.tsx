import Link from 'next/link'
import type { PlatformName } from '@/types/database'
import {
  BASIS_LABEL,
  COMPARE_LABEL,
  DEFAULT_HIT_THRESHOLD,
  RANGE_KEYS,
  RANGE_LABEL,
  REPORTING_TZ_LABEL,
  filtersToQuery,
  type Filters,
} from '@/lib/filters'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'

const selectCls =
  'rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-neutral-100 focus:border-neutral-400 focus:outline-none'
const labelCls = 'mb-1 block text-xs font-medium text-neutral-500'

function CheckGroup({
  summary,
  name,
  options,
  selected,
}: {
  summary: string
  name: string
  options: { value: string; label: string }[]
  selected: string[]
}) {
  return (
    <details className="relative">
      <summary className={`${selectCls} cursor-pointer list-none select-none`}>
        {summary}
        {selected.length > 0 && <span className="ml-1.5 text-neutral-400">({selected.length})</span>}
      </summary>
      <div className="absolute z-10 mt-1 min-w-48 space-y-1 rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-lg">
        {options.length === 0 && <p className="px-1 text-sm text-neutral-500">None available</p>}
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-neutral-800">
            <input type="checkbox" name={name} value={o.value} defaultChecked={selected.includes(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </details>
  )
}

export function FilterBar({
  action,
  filters,
  avatarOptions,
  platformOptions,
}: {
  action: string
  filters: Filters
  avatarOptions: { id: string; name: string }[]
  platformOptions: PlatformName[]
}) {
  const without = (patch: Partial<Filters>) => `${action}?${filtersToQuery({ ...filters, ...patch })}`

  const chips: { label: string; href: string }[] = []
  for (const id of filters.avatars) {
    const name = avatarOptions.find((a) => a.id === id)?.name ?? 'Avatar'
    chips.push({ label: name, href: without({ avatars: filters.avatars.filter((a) => a !== id) }) })
  }
  for (const p of filters.platforms) {
    chips.push({ label: PLATFORM_DISPLAY_NAME[p], href: without({ platforms: filters.platforms.filter((x) => x !== p) }) })
  }
  if (filters.basis !== 'gained') chips.push({ label: BASIS_LABEL[filters.basis], href: without({ basis: 'gained' }) })
  if (filters.compare !== 'previous') chips.push({ label: `Compare: ${COMPARE_LABEL[filters.compare]}`, href: without({ compare: 'previous' }) })
  if (filters.hitThreshold !== DEFAULT_HIT_THRESHOLD)
    chips.push({ label: `Hit ≥ ${filters.hitThreshold.toLocaleString('en-US')} views`, href: without({ hitThreshold: DEFAULT_HIT_THRESHOLD }) })

  return (
    <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <form method="get" action={action} className="flex flex-wrap items-end gap-3">
        <div>
          <label className={labelCls} htmlFor="f-range">Date range</label>
          <select id="f-range" name="range" defaultValue={filters.range} className={selectCls}>
            {RANGE_KEYS.map((k) => (
              <option key={k} value={k}>{RANGE_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="f-from">From (custom)</label>
          <input id="f-from" type="date" name="from" defaultValue={filters.from ?? ''} className={selectCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-to">To (custom)</label>
          <input id="f-to" type="date" name="to" defaultValue={filters.to ?? ''} className={selectCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-basis">Count views by</label>
          <select id="f-basis" name="basis" defaultValue={filters.basis} className={selectCls}>
            {(Object.keys(BASIS_LABEL) as (keyof typeof BASIS_LABEL)[]).map((k) => (
              <option key={k} value={k}>{BASIS_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="f-compare">Compare to</label>
          <select id="f-compare" name="compare" defaultValue={filters.compare} className={selectCls}>
            {(Object.keys(COMPARE_LABEL) as (keyof typeof COMPARE_LABEL)[]).map((k) => (
              <option key={k} value={k}>{COMPARE_LABEL[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={labelCls}>Avatar</span>
          <CheckGroup
            summary="All avatars"
            name="avatar"
            options={avatarOptions.map((a) => ({ value: a.id, label: a.name }))}
            selected={filters.avatars}
          />
        </div>
        <div>
          <span className={labelCls}>Platform</span>
          <CheckGroup
            summary="All platforms"
            name="platform"
            options={platformOptions.map((p) => ({ value: p, label: PLATFORM_DISPLAY_NAME[p] }))}
            selected={filters.platforms}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-hit">Hit threshold (views)</label>
          <input id="f-hit" type="number" min={1} name="hit" defaultValue={filters.hitThreshold} className={`${selectCls} w-28`} />
        </div>
        <button type="submit" className="rounded-md bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white">
          Apply
        </button>
        <Link href={action} className="py-1.5 text-sm text-neutral-400 hover:text-neutral-100">
          Reset
        </Link>
      </form>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <Link key={c.label} href={c.href} className="inline-flex items-center gap-1 rounded-full border border-neutral-700 px-2.5 py-0.5 text-xs text-neutral-300 hover:border-neutral-500">
              {c.label} <span aria-hidden>×</span>
              <span className="sr-only">remove filter</span>
            </Link>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-neutral-600">Day boundaries use {REPORTING_TZ_LABEL}. Timestamps are stored in UTC.</p>
    </div>
  )
}

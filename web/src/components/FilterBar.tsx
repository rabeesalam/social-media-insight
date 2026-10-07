import { Suspense } from 'react'
import Link from 'next/link'
import type { PlatformName } from '@/types/database'
import {
  AGE_BUCKETS,
  AGE_LABEL,
  BASIS_LABEL,
  CHART_KINDS,
  COMPARE_LABEL,
  DEFAULT_BREAKOUT_FLOOR,
  DEFAULT_BREAKOUT_MULT,
  DEFAULT_HIT_THRESHOLD,
  GRANULARITIES,
  METRICS,
  METRIC_LABEL,
  RANGE_KEYS,
  RANGE_LABEL,
  REPORTING_TZ_LABEL,
  SPLITS,
  SPLIT_LABEL,
  filtersToQuery,
  type Filters,
} from '@/lib/filters'
import { PLATFORM_DISPLAY_NAME } from '@/lib/platforms'
import { CopyLink, FilterMemory, ResetFilters } from '@/components/FilterTools'

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
      <div className="absolute z-20 mt-1 max-h-72 min-w-48 space-y-1 overflow-y-auto rounded-md border border-neutral-700 bg-neutral-900 p-2 shadow-lg">
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

function Sel<T extends string>({
  id,
  name,
  label,
  value,
  options,
}: {
  id: string
  name: string
  label: string
  value: T
  options: { value: T; label: string }[]
}) {
  return (
    <div>
      <label className={labelCls} htmlFor={id}>
        {label}
      </label>
      <select id={id} name={name} defaultValue={value} className={selectCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export interface FilterBarShow {
  chart?: boolean // metric, split, granularity, scale, normalize, chart type
  content?: boolean // age, caption search, hashtag, cross-posted only, exclude outliers
  basis?: boolean
}

export function FilterBar({
  action,
  filters,
  avatarOptions,
  platformOptions,
  show = {},
}: {
  action: string
  filters: Filters
  avatarOptions: { id: string; name: string }[]
  platformOptions: PlatformName[]
  show?: FilterBarShow
}) {
  const withPatch = (patch: Partial<Filters>) => {
    const q = filtersToQuery({ ...filters, ...patch })
    return q ? `${action}?${q}` : action
  }

  const chips: { label: string; href: string }[] = []
  for (const id of filters.avatars) {
    const name = avatarOptions.find((a) => a.id === id)?.name ?? 'Avatar'
    chips.push({ label: name, href: withPatch({ avatars: filters.avatars.filter((a) => a !== id) }) })
  }
  for (const p of filters.platforms) {
    chips.push({ label: PLATFORM_DISPLAY_NAME[p], href: withPatch({ platforms: filters.platforms.filter((x) => x !== p) }) })
  }
  if (filters.basis !== 'gained') chips.push({ label: BASIS_LABEL[filters.basis], href: withPatch({ basis: 'gained' }) })
  if (filters.compare !== 'previous') chips.push({ label: `Compare: ${COMPARE_LABEL[filters.compare]}`, href: withPatch({ compare: 'previous' }) })
  if (filters.hitThreshold !== DEFAULT_HIT_THRESHOLD)
    chips.push({ label: `Hit ≥ ${filters.hitThreshold.toLocaleString('en-US')} views`, href: withPatch({ hitThreshold: DEFAULT_HIT_THRESHOLD }) })
  if (filters.age !== 'all') chips.push({ label: AGE_LABEL[filters.age], href: withPatch({ age: 'all' }) })
  if (filters.q) chips.push({ label: `Caption: "${filters.q}"`, href: withPatch({ q: '' }) })
  if (filters.tag) chips.push({ label: `#${filters.tag}`, href: withPatch({ tag: '' }) })
  if (filters.xpost) chips.push({ label: 'Cross-posted only', href: withPatch({ xpost: false }) })
  if (filters.noOutliers) chips.push({ label: 'Top 1% excluded', href: withPatch({ noOutliers: false }) })
  if (filters.log) chips.push({ label: 'Log scale', href: withPatch({ log: false }) })
  if (filters.indexed) chips.push({ label: 'Indexed (=100)', href: withPatch({ indexed: false }) })
  if (filters.projection) chips.push({ label: `Projection ${filters.projection}d`, href: withPatch({ projection: 0 }) })

  const presets: { label: string; href: string }[] = [
    { label: 'All avatars · all platforms', href: withPatch({ avatars: [], platforms: [], split: 'avatar' }) },
    ...platformOptions.map((p) => ({ label: `All avatars · ${PLATFORM_DISPLAY_NAME[p]}`, href: withPatch({ avatars: [], platforms: [p], split: 'avatar' }) })),
    ...avatarOptions.map((a) => ({ label: `${a.name} · all platforms`, href: withPatch({ avatars: [a.id], platforms: [], split: 'platform' }) })),
  ]

  return (
    <div className="mb-6 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <Suspense fallback={null}>
        <FilterMemory />
      </Suspense>

      <details className="mb-3">
        <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">Quick scopes</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {presets.map((p) => (
            <Link key={p.label} href={p.href} className="rounded-md border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300 hover:border-neutral-500">
              {p.label}
            </Link>
          ))}
        </div>
      </details>

      <form method="get" action={action} className="flex flex-wrap items-end gap-3">
        <Sel id="f-range" name="range" label="Date range" value={filters.range} options={RANGE_KEYS.map((k) => ({ value: k, label: RANGE_LABEL[k] }))} />
        <div>
          <label className={labelCls} htmlFor="f-from">From (custom)</label>
          <input id="f-from" type="date" name="from" defaultValue={filters.from ?? ''} className={selectCls} />
        </div>
        <div>
          <label className={labelCls} htmlFor="f-to">To (custom)</label>
          <input id="f-to" type="date" name="to" defaultValue={filters.to ?? ''} className={selectCls} />
        </div>
        {show.basis !== false && (
          <Sel id="f-basis" name="basis" label="Count views by" value={filters.basis} options={(Object.keys(BASIS_LABEL) as (keyof typeof BASIS_LABEL)[]).map((k) => ({ value: k, label: BASIS_LABEL[k] }))} />
        )}
        <Sel id="f-compare" name="compare" label="Compare to" value={filters.compare} options={(Object.keys(COMPARE_LABEL) as (keyof typeof COMPARE_LABEL)[]).map((k) => ({ value: k, label: COMPARE_LABEL[k] }))} />
        <div>
          <span className={labelCls}>Avatar</span>
          <CheckGroup summary="All avatars" name="avatar" options={avatarOptions.map((a) => ({ value: a.id, label: a.name }))} selected={filters.avatars} />
        </div>
        <div>
          <span className={labelCls}>Platform</span>
          <CheckGroup summary="All platforms" name="platform" options={platformOptions.map((p) => ({ value: p, label: PLATFORM_DISPLAY_NAME[p] }))} selected={filters.platforms} />
        </div>

        {show.chart && (
          <>
            <Sel id="f-metric" name="metric" label="Metric" value={filters.metric} options={METRICS.map((m) => ({ value: m, label: METRIC_LABEL[m] }))} />
            <Sel id="f-split" name="split" label="Split by" value={filters.split} options={SPLITS.map((s) => ({ value: s, label: SPLIT_LABEL[s] }))} />
            <Sel id="f-gran" name="gran" label="Granularity" value={filters.granularity} options={GRANULARITIES.map((g) => ({ value: g, label: g === 'auto' ? 'Auto' : g.charAt(0).toUpperCase() + g.slice(1) }))} />
            <Sel id="f-scale" name="scale" label="Scale" value={filters.log ? 'log' : 'linear'} options={[{ value: 'linear', label: 'Linear' }, { value: 'log', label: 'Log' }]} />
            <Sel id="f-norm" name="norm" label="Normalize" value={filters.indexed ? 'indexed' : 'absolute'} options={[{ value: 'absolute', label: 'Absolute' }, { value: 'indexed', label: 'Indexed (=100 at start)' }]} />
            <Sel id="f-proj" name="proj" label="Projection" value={String(filters.projection)} options={[{ value: '0', label: 'Off' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }]} />
            <Sel id="f-kind" name="kind" label="Chart type" value={filters.kind} options={CHART_KINDS.map((k) => ({ value: k, label: k.charAt(0).toUpperCase() + k.slice(1) }))} />
          </>
        )}

        <details className="w-full">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">More filters and thresholds</summary>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <label className={labelCls} htmlFor="f-hit">Hit threshold (views)</label>
              <input id="f-hit" type="number" min={1} name="hit" defaultValue={filters.hitThreshold} className={`${selectCls} w-28`} />
            </div>
            <div>
              <label className={labelCls} htmlFor="f-mult">Breakout multiplier (×)</label>
              <input id="f-mult" type="number" min={1} step="0.5" name="mult" defaultValue={filters.breakoutMult} className={`${selectCls} w-24`} />
            </div>
            <div>
              <label className={labelCls} htmlFor="f-floor">Breakout floor (views)</label>
              <input id="f-floor" type="number" min={1} name="floor" defaultValue={filters.breakoutFloor} className={`${selectCls} w-28`} />
            </div>
            {show.content !== false && (
              <>
                <Sel id="f-age" name="age" label="Video age" value={filters.age} options={AGE_BUCKETS.map((a) => ({ value: a, label: AGE_LABEL[a] }))} />
                <div>
                  <label className={labelCls} htmlFor="f-q">Caption contains</label>
                  <input id="f-q" type="search" name="q" defaultValue={filters.q} placeholder="e.g. purevpn" className={`${selectCls} w-40`} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="f-tag">Hashtag</label>
                  <input id="f-tag" type="text" name="tag" defaultValue={filters.tag} placeholder="e.g. 3danatomy" className={`${selectCls} w-36`} />
                </div>
                <label className="flex items-center gap-2 pb-2 text-sm text-neutral-300">
                  <input type="checkbox" name="xpost" value="1" defaultChecked={filters.xpost} /> Cross-posted only
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm text-neutral-300">
                  <input type="checkbox" name="outliers" value="1" defaultChecked={filters.noOutliers} /> Exclude top 1% videos
                </label>
              </>
            )}
          </div>
        </details>

        <button type="submit" className="rounded-md bg-neutral-100 px-4 py-1.5 text-sm font-medium text-neutral-900 hover:bg-white">
          Apply
        </button>
        <ResetFilters href={action} />
        <CopyLink />
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
      <p className="mt-3 text-xs text-neutral-600">
        Day boundaries use {REPORTING_TZ_LABEL}. Timestamps are stored in UTC. Breakout rule: a day with ≥ {filters.breakoutMult === DEFAULT_BREAKOUT_MULT ? DEFAULT_BREAKOUT_MULT : filters.breakoutMult}× the
        previous 7-day average and ≥ {filters.breakoutFloor === DEFAULT_BREAKOUT_FLOOR ? DEFAULT_BREAKOUT_FLOOR.toLocaleString('en-US') : filters.breakoutFloor.toLocaleString('en-US')} views.
      </p>
    </div>
  )
}

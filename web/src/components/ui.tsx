import Link from 'next/link'
import { filtersToQuery, type Filters } from '@/lib/filters'

export function Card({
  title,
  note,
  children,
  exportHref,
  className = '',
}: {
  title: string
  note?: React.ReactNode
  children: React.ReactNode
  exportHref?: string
  className?: string
}) {
  return (
    <section className={`rounded-lg border border-neutral-800 bg-neutral-900/60 p-4 ${className}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">{title}</h2>
          {note && <p className="mt-0.5 max-w-3xl text-xs text-neutral-500">{note}</p>}
        </div>
        {exportHref && (
          <a href={exportHref} className="shrink-0 rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200">
            Export CSV
          </a>
        )}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded border border-dashed border-neutral-800 p-6 text-center text-sm text-neutral-500">{children}</p>
}

export function Locked({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-neutral-700 bg-neutral-950/40 p-4 text-sm text-neutral-400">
      <p className="font-medium text-neutral-300">{title}</p>
      <p className="mt-1 text-xs">{children}</p>
    </div>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'blue' | 'green' | 'amber' | 'red' }) {
  const tones = {
    neutral: 'border-neutral-700 text-neutral-300',
    blue: 'border-sky-800 bg-sky-950/50 text-sky-300',
    green: 'border-green-800 bg-green-950/40 text-green-300',
    amber: 'border-amber-800 bg-amber-950/40 text-amber-300',
    red: 'border-red-900 bg-red-950/40 text-red-300',
  }
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] ${tones[tone]}`}>{children}</span>
}

export function DataSince({ since, estimated = true }: { since: string | null; estimated?: boolean }) {
  return (
    <p className="mt-2 text-xs text-neutral-600">
      {since ? `Data since ${since}.` : 'No history yet.'}
      {estimated && ' Hollow dots are estimated days (no sync that day, so the change is spread evenly across the gap).'}
    </p>
  )
}

export function exportUrl(dataset: string, f: Filters): string {
  const q = filtersToQuery(f)
  return `/api/export.csv?dataset=${dataset}${q ? `&${q}` : ''}`
}

export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h1 className="text-lg font-semibold">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm text-neutral-500">{subtitle}</p>}
    </div>
  )
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-sm text-neutral-400 hover:text-neutral-100">
      {children}
    </Link>
  )
}

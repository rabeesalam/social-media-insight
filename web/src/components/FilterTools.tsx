'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const KEY = 'social-insight-filters-v1'

// Remembers the last-used filters per browser (spec: "remembered per user"). When a page is opened
// with no filters in the URL, the saved ones are applied; whenever filters are present they are saved.
export function FilterMemory() {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const qs = params.toString()

  useEffect(() => {
    try {
      if (qs) {
        window.localStorage.setItem(KEY, qs)
      } else {
        const saved = window.localStorage.getItem(KEY)
        if (saved) router.replace(`${pathname}?${saved}`)
      }
    } catch {
      // storage blocked: filters simply are not remembered
    }
  }, [qs, pathname, router])

  return null
}

export function ResetFilters({ href }: { href: string }) {
  return (
    <a
      href={href}
      onClick={() => {
        try {
          window.localStorage.removeItem(KEY)
        } catch {
          // ignore
        }
      }}
      className="py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
    >
      Reset
    </a>
  )
}

export function CopyLink() {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href)
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        } catch {
          window.prompt('Copy this link', window.location.href)
        }
      }}
      className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
    >
      {done ? 'Copied' : 'Copy link to this view'}
    </button>
  )
}

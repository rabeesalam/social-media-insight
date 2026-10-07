import { createClient } from '@/lib/supabase/server'
import { loadScoped, type Scoped } from '@/lib/scope'

const CACHE = 'private, max-age=300' // data only changes on sync, so 5 minutes is safe

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { 'Cache-Control': status === 200 ? CACHE : 'no-store' } })
}

export function paramsOf(request: Request): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {}
  for (const [k, v] of new URL(request.url).searchParams) {
    const cur = out[k]
    out[k] = cur === undefined ? v : Array.isArray(cur) ? [...cur, v] : [cur, v]
  }
  return out
}

// Every endpoint stays behind the existing login: no session, no data.
export async function withScope(request: Request, fn: (sc: Scoped) => unknown): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return json({ error: 'unauthorized' }, 401)
  try {
    return json(await fn(await loadScoped(paramsOf(request))))
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'failed' }, 500)
  }
}

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = String(v)
  // Neutralise spreadsheet formula injection from user-controlled text (captions).
  if (/^[=+\-@]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n')
}

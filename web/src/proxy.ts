import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next.js 16 renamed `middleware.ts` to `proxy.ts` (the exported function must be named or
// default-exported as `proxy`) — verified against node_modules/next/dist/docs at build time
// since this is newer than any Next.js version in training data. Do not rename this back to
// middleware.ts; that convention is deprecated and Next.js 16 will not pick it up silently.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}

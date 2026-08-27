import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

// Server client for Server Components / Route Handlers / Server Actions — reads the user's
// session from cookies and runs every query as that authenticated user, so RLS applies exactly
// as it would for the browser. This is the read path for the whole dashboard.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — safe to ignore because proxy.ts
            // refreshes the session cookie on every request that needs it.
          }
        },
      },
    }
  )
}

// Service-role client — bypasses RLS entirely. Only ever import this from Next.js API routes
// (never from a Server Component that could end up in a client bundle, never from anything the
// browser can trigger without an explicit admin check first). See
// docs/decisions/0002-secret-boundary-and-auth-model.md.
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export function createServiceRoleClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

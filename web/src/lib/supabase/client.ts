import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

// Browser client — anon key only. RLS (see supabase/migrations/0005_rls_policies.sql) is the
// actual enforcement boundary; this key alone grants nothing without an authenticated session.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

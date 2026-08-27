import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logout } from '@/app/actions/auth'
import type { Profile } from '@/types/database'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, created_at, updated_at')
    .eq('id', user.id)
    .single<Profile>()

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="border-b border-neutral-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <nav className="flex items-center gap-6">
            <Link href="/dashboard" className="font-semibold">
              Social Analytics
            </Link>
            <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-neutral-100">
              Avatars
            </Link>
            <Link href="/dashboard/weekly" className="text-sm text-neutral-400 hover:text-neutral-100">
              Weekly
            </Link>
            <Link href="/dashboard/devices" className="text-sm text-neutral-400 hover:text-neutral-100">
              Devices
            </Link>
          </nav>
          <div className="flex items-center gap-3 text-sm text-neutral-400">
            <span>
              {profile?.email} · <span className="uppercase">{profile?.role ?? 'viewer'}</span>
            </span>
            <form action={logout}>
              <button type="submit" className="text-neutral-400 hover:text-neutral-100">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  )
}

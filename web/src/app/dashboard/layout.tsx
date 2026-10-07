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
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <nav className="flex min-w-0 items-center gap-5 overflow-x-auto whitespace-nowrap pr-4">
            <Link href="/dashboard" className="font-semibold">
              Social Analytics
            </Link>
            {[
              ['/dashboard', 'Avatars'],
              ['/dashboard/insights', 'Insights'],
              ['/dashboard/trends', 'Trends'],
              ['/dashboard/growth', 'Growth'],
              ['/dashboard/engagement', 'Engagement'],
              ['/dashboard/content', 'Content'],
              ['/dashboard/compare', 'Compare'],
              ['/dashboard/videos', 'Videos'],
              ['/dashboard/digest', 'Digest'],
              ['/dashboard/health', 'Health'],
              ['/dashboard/devices', 'Devices'],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="text-sm text-neutral-400 hover:text-neutral-100">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex shrink-0 items-center gap-3 text-sm text-neutral-400">
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
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  )
}

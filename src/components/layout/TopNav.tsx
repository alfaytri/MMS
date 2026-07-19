import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NavDropdown, NavDropdownGroup } from './NavDropdown'
import { UserMenu } from './UserMenu'
import { NotificationBell } from './NotificationBell'
import { MobileNavDrawer } from './MobileNavDrawer'
import { NAV_ITEMS } from './nav-config'
import { Wrench } from 'lucide-react'

export async function TopNav() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('auth_user_id', user.id)
        .single()
    : { data: null }

  return (
    <header className="sticky top-0 z-50 h-14 bg-background border-b border-border">
      <div className="h-full w-full flex items-center px-3 sm:px-4 lg:px-6 2xl:px-10 gap-2">
        <MobileNavDrawer />

        <Link
          href="/"
          className="flex items-center gap-2 text-primary font-bold lg:mr-4 shrink-0"
        >
          <Wrench className="h-5 w-5" />
          <span className="text-sm">Alfaytri</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
          <NavDropdownGroup>
            {NAV_ITEMS.map((entry) => (
              <NavDropdown key={entry.label} entry={entry} />
            ))}
          </NavDropdownGroup>
        </nav>

        <div className="flex-1 lg:hidden" />

        {user && <NotificationBell />}
        {user && (
          <UserMenu
            email={user.email ?? ''}
            name={profile?.full_name ?? undefined}
            avatarUrl={profile?.avatar_url ?? undefined}
          />
        )}
      </div>
    </header>
  )
}

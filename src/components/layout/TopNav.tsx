import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { NavDropdown, NavDropdownGroup } from './NavDropdown'
import { UserMenu } from './UserMenu'
import { NotificationBell } from './NotificationBell'
import { MobileNavDrawer } from './MobileNavDrawer'
import { DivisionSwitcherChip } from './DivisionSwitcher'
import { NAV_ITEMS } from './nav-config'
import { Wrench } from 'lucide-react'

export async function TopNav() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // The profile (needs the user) and the primary company (independent) have no
  // data dependency on each other — run them together so it's one round-trip
  // instead of two serialized on every dashboard page. Brand string + logo come
  // from the primary companies row (alphabetically first) so renaming/re-logoing
  // the company in Master Data → Companies updates everywhere.
  const [profileRes, companyRes] = await Promise.all([
    user
      ? supabase.from('user_data').select('full_name, avatar_url').eq('auth_user_id', user.id).single()
      : Promise.resolve({ data: null }),
    supabase.from('companies').select('name_en, logo_url').order('name_en').limit(1).maybeSingle(),
  ])
  const profile = profileRes.data
  const primaryCompany = companyRes.data
  const brandName = primaryCompany?.name_en ?? ''
  const brandLogo = primaryCompany?.logo_url ?? null

  return (
    <header className="sticky top-0 z-50 h-14 bg-background border-b border-border">
      <div className="h-full w-full flex items-center px-3 sm:px-4 lg:px-6 2xl:px-10 gap-2">
        <MobileNavDrawer />

        <Link
          href="/"
          className="flex items-center gap-2 text-primary font-bold lg:mr-4 shrink-0"
        >
          {brandLogo ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={brandLogo}
              alt={brandName || 'Company logo'}
              className="h-6 w-6 object-contain rounded-sm"
            />
          ) : (
            <Wrench className="h-5 w-5" />
          )}
          <span className="text-sm">{brandName}</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 flex-1 overflow-x-auto">
          <NavDropdownGroup>
            {NAV_ITEMS.map((entry) => (
              <NavDropdown key={entry.label} entry={entry} />
            ))}
          </NavDropdownGroup>
        </nav>

        <div className="flex-1 lg:hidden" />

        {user && <DivisionSwitcherChip className="shrink-0" />}
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

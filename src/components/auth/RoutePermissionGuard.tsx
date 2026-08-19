'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { matchRequiredPermission } from '@/lib/route-permissions'
import { firstAccessibleHref } from '@/components/layout/nav-config'

/**
 * Blanket page-level permission guard + landing redirect.
 *
 * Wrapped around the dashboard `{children}` in (dashboard)/layout.tsx so
 * every page is enforced without per-page edits.
 *
 * 1. Landing redirect — a user whose role can't open the Dashboard shouldn't
 *    sit on it. On the home route (`/`), if they lack `dashboard.view`, they're
 *    sent to the first page their permissions allow (e.g. a custody-only "teams"
 *    user lands on /warehouse/custody). A user who can open nothing sees a
 *    friendly no-access screen instead of a blank dashboard.
 * 2. Route enforcement — looks up the required permission for the current
 *    pathname in ROUTE_PERMISSIONS; renders "Access Denied" if the user lacks it.
 *
 * - Unprotected routes (no entry in the map) render normally.
 * - System admins (is_system_admin = true) and the bootstrap email pass through
 *   because usePermissions reports `isSystemAdmin = true` for them.
 */
export function RoutePermissionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data, isLoading } = usePermissions()

  const isSystemAdmin = data?.isSystemAdmin ?? false
  const userPerms = data?.permissions ?? []

  // Access predicate mirroring useHasPermission (admin bypass, any-of match).
  const canAccess = (permission?: string | string[]) => {
    if (isSystemAdmin) return true
    if (!permission) return true
    const list = Array.isArray(permission) ? permission : [permission]
    return list.some((p) => userPerms.includes(p))
  }

  const onHome = pathname === '/'
  const canSeeDashboard = isSystemAdmin || userPerms.includes('dashboard.view')
  // Only resolve a landing target once permissions have loaded, on the home
  // route, for a user without Dashboard access. Stable across renders (same
  // perms → same href), so the redirect effect fires once.
  const landingHref =
    !isLoading && !!data && onHome && !canSeeDashboard
      ? firstAccessibleHref(canAccess)
      : null

  useEffect(() => {
    if (landingHref) router.replace(landingHref)
  }, [landingHref, router])

  // Wait for permissions before deciding — avoids flashing the wrong screen
  // for legitimate users during the initial fetch.
  if (isLoading) return null

  // Home route, no Dashboard access: render nothing while redirecting (no
  // dashboard flash), or a no-access screen when there's nowhere to send them.
  if (onHome && !canSeeDashboard) {
    if (landingHref) return null
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground px-4">
        <ShieldAlert className="h-16 w-16" />
        <h2 className="text-xl font-semibold text-foreground">No pages available yet</h2>
        <p className="text-sm max-w-md text-center">
          Your account doesn&apos;t have access to any pages yet. Contact your administrator to request access.
        </p>
      </div>
    )
  }

  const required = matchRequiredPermission(pathname)
  if (!required) return <>{children}</>

  if (isSystemAdmin) return <>{children}</>

  const list = Array.isArray(required) ? required : [required]
  if (list.some((p) => userPerms.includes(p))) return <>{children}</>

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground px-4">
      <ShieldAlert className="h-16 w-16" />
      <h2 className="text-xl font-semibold text-foreground">Access Denied</h2>
      <p className="text-sm max-w-md text-center">
        You don&apos;t have permission to view this page. Contact your administrator to request access.
      </p>
    </div>
  )
}

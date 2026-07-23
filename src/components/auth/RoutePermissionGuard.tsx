'use client'

import { usePathname } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { usePermissions } from '@/hooks/usePermissions'
import { matchRequiredPermission } from '@/lib/route-permissions'

/**
 * Blanket page-level permission guard.
 *
 * Wrapped around the dashboard `{children}` in (dashboard)/layout.tsx so
 * every page is enforced without per-page edits. Looks up the required
 * permission for the current pathname in ROUTE_PERMISSIONS; renders
 * "Access Denied" if the user lacks it.
 *
 * - Unprotected routes (no entry in the map) render normally.
 * - System admins (is_system_admin = true) and the bootstrap email pass through
 *   because usePermissions reports `isSystemAdmin = true` for them.
 */
export function RoutePermissionGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { data, isLoading } = usePermissions()

  // Wait for permissions to load before deciding — avoids flashing
  // "Access Denied" for legitimate users during initial fetch.
  if (isLoading) return null

  const required = matchRequiredPermission(pathname)
  if (!required) return <>{children}</>

  const isSystemAdmin = data?.isSystemAdmin ?? false
  if (isSystemAdmin) return <>{children}</>

  const userPerms = data?.permissions ?? []
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

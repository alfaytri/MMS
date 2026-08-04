'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

type PermissionsResult = {
  permissions: string[]
  isSystemAdmin: boolean
  roles: string[]
}

export function usePermissions() {
  return useQuery<PermissionsResult>({
    queryKey: queryKeys.permissions.user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { permissions: [], isSystemAdmin: false, roles: [] }

      const bootstrapEmail = process.env.NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
      const callerEmail = user.email?.trim().toLowerCase() ?? null
      const isBootstrap = !!(bootstrapEmail && callerEmail === bootstrapEmail)

      const { data: profile } = await supabase
        .from('user_data')
        .select('user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(name, is_system_admin, permissions))')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!profile) return { permissions: [], isSystemAdmin: isBootstrap, roles: [] }

      const roles = (profile.user_custom_roles ?? []) as Array<{
        custom_roles: { name: string; is_system_admin: boolean; permissions: string[] } | null
      }>

      const permissions = roles.flatMap((r) => r.custom_roles?.permissions ?? [])
      // A user is a system admin if any of their roles either:
      //   - is the seeded system role (is_system_admin = true on Owner / Admin), OR
      //   - holds the `system.admin` permission key (the UI-toggleable bypass).
      const isSystemAdmin =
        roles.some((r) => r.custom_roles?.is_system_admin === true) ||
        permissions.includes('system.admin')

      const roleNames = roles.map((r) => r.custom_roles?.name).filter(Boolean) as string[]

      return { permissions, isSystemAdmin, roles: roleNames }
    },
  })
}

export function useHasPermission(permission: string | string[]): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  const required = Array.isArray(permission) ? permission : [permission]
  return required.some((p) => data.permissions.includes(p))
}

export function useHasEditPermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes(`${area}.edit`) ||
    data.permissions.includes(`${area}.manage`)
  )
}

export function useHasCreatePermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return data.permissions.includes(`${area}.create`)
}

export function useHasViewPermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes(`${area}.view`) ||
    data.permissions.includes(`${area}.create`) ||
    data.permissions.includes(`${area}.edit`) ||
    data.permissions.includes(`${area}.manage`)
  )
}

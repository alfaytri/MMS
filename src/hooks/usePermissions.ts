'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

type PermissionsResult = {
  permissions: string[]
  isSystemAdmin: boolean
}

export function usePermissions() {
  return useQuery<PermissionsResult>({
    queryKey: queryKeys.permissions.user,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { permissions: [], isSystemAdmin: false }

      const bootstrapEmail = process.env.NEXT_PUBLIC_ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase()
      const callerEmail = user.email?.trim().toLowerCase() ?? null
      const isBootstrap = !!(bootstrapEmail && callerEmail === bootstrapEmail)

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(is_system, permissions))')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!profile) return { permissions: [], isSystemAdmin: isBootstrap }

      const roles = (profile.user_custom_roles ?? []) as Array<{
        custom_roles: { is_system: boolean; permissions: string[] } | null
      }>

      const permissions = roles.flatMap((r) => r.custom_roles?.permissions ?? [])
      // A user is a system admin if any of their roles either:
      //   - is the seeded system role (is_system = true on Owner / Admin), OR
      //   - holds the `system.admin` permission key (the UI-toggleable bypass).
      const isSystemAdmin =
        roles.some((r) => r.custom_roles?.is_system === true) ||
        permissions.includes('system.admin')

      return { permissions, isSystemAdmin }
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

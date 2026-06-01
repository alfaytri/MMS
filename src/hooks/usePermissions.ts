'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

type PermissionsResult = {
  permissions: string[]
  isSystemAdmin: boolean
}

export function usePermissions() {
  return useQuery<PermissionsResult>({
    queryKey: ['user-permissions'],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return { permissions: [], isSystemAdmin: false }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('user_custom_roles!user_custom_roles_profile_id_fkey(custom_roles(is_system, permissions))')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (!profile) return { permissions: [], isSystemAdmin: false }

      const roles = (profile.user_custom_roles ?? []) as Array<{
        custom_roles: { is_system: boolean; permissions: string[] } | null
      }>

      const isSystemAdmin = roles.some((r) => r.custom_roles?.is_system === true)
      const permissions = roles.flatMap((r) => r.custom_roles?.permissions ?? [])

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

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

export function useHasManagePermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return data.permissions.includes(`${area}.manage`)
}

export function useHasCreatePermission(area: string): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return data.permissions.includes(`${area}.create`)
}

/**
 * Inventory-catalog create/edit gating. Mirrors the RLS split
 * (migration 20260930000000): create = inventory.catalog.create OR .manage;
 * edit = inventory.catalog.edit OR .manage. `.manage` is the legacy umbrella
 * so existing roles keep both. Call the underlying hooks unconditionally, then
 * combine (never short-circuit a hook — rules-of-hooks).
 */
export function useInventoryCatalogPerms(): { canCreate: boolean; canEdit: boolean } {
  const hasCreate = useHasCreatePermission('inventory.catalog')
  const hasManage = useHasManagePermission('inventory.catalog')
  const canEdit = useHasEditPermission('inventory.catalog')
  return { canCreate: hasCreate || hasManage, canEdit }
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

/**
 * Consumption-specific granular create check. A caller can create a
 * consumption of `kind` if any of these hold:
 *   - system.admin
 *   - the umbrella `consumption.create` (grants both custody + internal)
 *   - the narrower `consumption.create.<kind>` key
 */
export function useCanCreateConsumptionFor(kind: 'custody' | 'internal'): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes('consumption.create') ||
    data.permissions.includes(`consumption.create.${kind}`)
  )
}

/**
 * True if the caller can create AT LEAST ONE consumer type — used to decide
 * whether to show the New Consumption button at all.
 */
export function useCanCreateAnyConsumption(): boolean {
  const { data } = usePermissions()
  if (!data) return false
  if (data.isSystemAdmin) return true
  return (
    data.permissions.includes('consumption.create') ||
    data.permissions.includes('consumption.create.custody') ||
    data.permissions.includes('consumption.create.internal')
  )
}

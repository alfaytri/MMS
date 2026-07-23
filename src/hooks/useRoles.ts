import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

export type CustomRole = DBTable<'custom_roles'>
export type CustomRoleInsert = DBInsert<'custom_roles'>
export type CustomRoleUpdate = DBUpdate<'custom_roles'>

export function useRoles() {
  return useQuery({
    queryKey: queryKeys.roles.custom,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('custom_roles').select('*').is('deleted_at', null).order('name')
      if (error) throw error
      return data as CustomRole[]
    },
  })
}

/**
 * Invalidate every query whose result depends on custom_roles data.
 * Includes downstream joins (user_custom_roles → custom_roles), permission
 * checks, and profile lists that embed role info. Called after any role
 * create / update / delete so downstream UI reflects the change immediately
 * without requiring a manual user edit.
 */
function invalidateRoleDependentQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.roles.custom })
  queryClient.invalidateQueries({ queryKey: queryKeys.roles.approvalCoverage })
  queryClient.invalidateQueries({ queryKey: queryKeys.roles.myApprovalSlots })
  // Prefix invalidations for ['user-roles', profileId] — hits every user
  queryClient.invalidateQueries({ queryKey: ['user-roles'] })
  // Permission checks that read is_inventory_receiver
  queryClient.invalidateQueries({ queryKey: queryKeys.receivals.canCreateInventoryReceival })
  // Profile lists that embed role data
  queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: CustomRoleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('custom_roles').insert(values).select().single()
      if (error) throw error
      void logActivity({
        action: 'Role Created',
        module: 'custom_roles',
        entity_id: data.id,
        entity_type: 'role',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => { invalidateRoleDependentQueries(queryClient) },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: CustomRoleUpdate & { id: string }) => {
      const supabase = createClient()
      const { data: old } = await supabase.from('custom_roles').select('*').eq('id', id).maybeSingle()
      const { data, error } = await supabase.from('custom_roles').update(values).eq('id', id).select().single()
      if (error) throw error
      void logActivity({
        action: 'Role Updated',
        module: 'custom_roles',
        entity_id: id,
        entity_type: 'role',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => { invalidateRoleDependentQueries(queryClient) },
  })
}

export function useDeleteRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data: old } = await supabase.from('custom_roles').select('*').eq('id', id).maybeSingle()
      const { error } = await supabase.from('custom_roles').delete().eq('id', id)
      if (error) throw error
      void logActivity({
        action: 'Role Deleted',
        module: 'custom_roles',
        entity_id: id,
        entity_type: 'role',
        severity: 'warning',
        old_data: old as unknown as Record<string, unknown> | null,
      })
    },
    onSuccess: () => { invalidateRoleDependentQueries(queryClient) },
  })
}

export function useUserRoles(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.roles.userRoles(profileId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('*, custom_roles(name, color)')
        .eq('profile_id', profileId!)
      if (error) throw error
      return data
    },
    enabled: !!profileId,
  })
}

export function useAssignRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: { profile_id: string; role_id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('user_custom_roles').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.userRoles(variables.profile_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.approvalCoverage })
    },
  })
}

export function useRemoveRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, profileId }: { id: string; profileId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('user_custom_roles').delete().eq('id', id)
      if (error) throw error
      return profileId
    },
    onSuccess: (profileId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.userRoles(profileId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.profiles.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.roles.approvalCoverage })
    },
  })
}

/** Returns the set of approval-slot role NAMES that have at least one assignee.
 *  Used by the approval-chain editor to flag tiers whose required_roles have no users. */
export function useApprovalRoleCoverage() {
  return useQuery({
    queryKey: queryKeys.roles.approvalCoverage,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('custom_roles!inner(name, is_approval_slot, deleted_at)')
        .limit(2000)
      if (error) throw error
      type Row = { custom_roles: { name: string; is_approval_slot: boolean; deleted_at: string | null } | null }
      const covered = new Set<string>()
      for (const row of (data as unknown as Row[] | null ?? [])) {
        const r = row.custom_roles
        if (r?.is_approval_slot && !r.deleted_at) covered.add(r.name)
      }
      return covered
    },
    staleTime: 60 * 1000,
  })
}

/** Returns the names + scopes of approval-slot custom_roles the current user holds.
 *  Replaces the old useCurrentUserApprovalRoles hook. */
export function useMyApprovalSlotRoles() {
  return useQuery({
    queryKey: queryKeys.roles.myApprovalSlots,
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return [] as { name: string; scopes: string[] | null }[]
      const { data: profile } = await supabase
        .from('user_data').select('id').eq('auth_user_id', user.id).maybeSingle()
      if (!profile) return [] as { name: string; scopes: string[] | null }[]
      const { data, error } = await supabase
        .from('user_custom_roles')
        .select('approval_scopes, custom_roles!inner(name, is_approval_slot, deleted_at)')
        .eq('profile_id', profile.id)
      if (error) throw error
      type Row = { approval_scopes: string[] | null; custom_roles: { name: string; is_approval_slot: boolean; deleted_at: string | null } | null }
      return (data as unknown as Row[] | null ?? [])
        .filter((r) => r.custom_roles?.is_approval_slot && !r.custom_roles?.deleted_at)
        .map((r) => ({ name: r.custom_roles!.name, scopes: r.approval_scopes }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

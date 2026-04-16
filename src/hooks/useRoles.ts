import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'

export type CustomRole = DBTable<'custom_roles'>
export type CustomRoleInsert = DBInsert<'custom_roles'>
export type CustomRoleUpdate = DBUpdate<'custom_roles'>

export function useRoles() {
  return useQuery({
    queryKey: ['custom-roles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.from('custom_roles').select('*').is('deleted_at', null).order('name')
      if (error) throw error
      return data as CustomRole[]
    },
  })
}

export function useCreateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: CustomRoleInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('custom_roles').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['custom-roles'] }) },
  })
}

export function useUpdateRole() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: CustomRoleUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('custom_roles').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['custom-roles'] }) },
  })
}

export function useUserRoles(profileId: string | null) {
  return useQuery({
    queryKey: ['user-roles', profileId],
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
      queryClient.invalidateQueries({ queryKey: ['user-roles', variables.profile_id] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
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
      queryClient.invalidateQueries({ queryKey: ['user-roles', profileId] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

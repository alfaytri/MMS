import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBUpdate } from '@/types/database.types'

export type Profile = DBTable<'profiles'>
export type ProfileUpdate = DBUpdate<'profiles'>

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('profiles')
        .select('*, user_custom_roles(role_id, custom_roles(name, color)), user_divisions(division_id, divisions(name, short_name, color))')
        .order('full_name')
      if (error) throw error
      return data
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: ProfileUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('profiles').update(values).eq('id', id).select().single()
      if (error) throw error
      return data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['profiles'] }) },
  })
}

export function useUserDivisions(profileId: string | null) {
  return useQuery({
    queryKey: ['user-divisions', profileId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_divisions')
        .select('*, divisions(name, short_name, color)')
        .eq('profile_id', profileId!)
      if (error) throw error
      return data
    },
    enabled: !!profileId,
  })
}

export function useAssignDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: { profile_id: string; division_id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('user_divisions').insert(values).select().single()
      if (error) throw error
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-divisions', variables.profile_id] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useRemoveDivision() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, profileId }: { id: string; profileId: string }) => {
      const supabase = createClient()
      const { error } = await supabase.from('user_divisions').delete().eq('id', id)
      if (error) throw error
      return profileId
    },
    onSuccess: (profileId) => {
      queryClient.invalidateQueries({ queryKey: ['user-divisions', profileId] })
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

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

// Returns the profile row linked to the currently-authenticated user, or null
// if none exists (user needs to create one). Uses maybeSingle so zero rows is
// not an error.
export function useCurrentUserProfile() {
  return useQuery({
    queryKey: ['my-profile'],
    queryFn: async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (error) throw error
      return data as Profile | null
    },
  })
}

// One-click self-provision — creates a profile row for the current auth user.
// Relies on the `Users can create own profile` INSERT policy.
export function useCreateMyProfile() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: { full_name: string; user_type?: 'internal' | 'external' }) => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')
      const { data, error } = await (supabase as any)
        .from('profiles')
        .insert({
          auth_user_id: user.id,
          email: user.email ?? null,
          full_name: values.full_name,
          user_type: values.user_type ?? 'internal',
          is_active: true,
        })
        .select()
        .single()
      if (error) throw error
      return data as Profile
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    },
  })
}

// Invite a new user via the /api/users/invite Route Handler.
// The handler uses the service_role admin key server-side.
export function useInviteUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      email: string
      full_name: string
      user_type?: 'internal' | 'external'
    }) => {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Invite failed')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
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

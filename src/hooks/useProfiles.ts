import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBUpdate } from '@/types/database.types'

export type Profile = DBTable<'profiles'>
export type ProfileUpdate = DBUpdate<'profiles'>

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      // Use the admin API route so RLS doesn't filter results for the calling user.
      const res = await fetch('/api/users')
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error ?? `Failed to fetch users (${res.status})`)
      }
      return res.json() as Promise<Profile[]>
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

// ─── Admin-driven user management ──────────────────────────────────────

export function useCreateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      full_name: string
      email: string
      password: string
      user_type?: 'internal' | 'external'
      role_ids?: string[]
    }) => {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Create failed')
      return json as { profile: Profile; assigned_role_ids: string[]; warning?: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      auth_user_id: string
      full_name?: string
      email?: string
      user_type?: 'internal' | 'external'
      is_active?: boolean
      role_ids?: string[]
    }) => {
      const { auth_user_id, ...body } = payload
      const res = await fetch(`/api/users/${auth_user_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Update failed')
      return json
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] })
      queryClient.invalidateQueries({ queryKey: ['my-profile'] })
    },
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: async (payload: { user_id: string; password: string }) => {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Reset failed')
      return json
    },
  })
}

export function useCompleteMyPasswordChange() {
  return useMutation({
    mutationFn: async (payload: { new_password: string }) => {
      const res = await fetch('/api/users/me/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Change failed')
      // CRITICAL: refresh the client session so the middleware sees
      // must_change_password: false on the very next navigation.
      const supabase = createClient()
      await supabase.auth.refreshSession()
      return json
    },
  })
}

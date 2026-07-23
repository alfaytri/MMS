// src/hooks/useNotifications.ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type NotificationRow = {
  id: string
  profile_id: string
  type: string
  title: string
  body: string | null
  related_id: string | null
  related_type: string | null
  read_at: string | null
  actioned_at: string | null
  created_at: string
}

let cachedProfileId: string | null | undefined = undefined

async function getMyProfileId(): Promise<string | null> {
  if (cachedProfileId !== undefined) return cachedProfileId as string | null
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) { cachedProfileId = null; return null }
  const { data } = await supabase
    .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  cachedProfileId = data?.id ?? null
  return cachedProfileId as string | null
}

export function resetCachedProfileId() {
  cachedProfileId = undefined
}

export function usePendingNotificationCount() {
  return useQuery({
    queryKey: queryKeys.notifications.pendingCount,
    queryFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return 0
      const supabase = createClient()
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .is('actioned_at', null)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function usePendingNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.pending,
    queryFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return [] as NotificationRow[]
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('profile_id', profileId)
        .is('actioned_at', null)
        .order('created_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as NotificationRow[]
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useCompletedNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications.completed,
    queryFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return [] as NotificationRow[]
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('profile_id', profileId)
        .not('actioned_at', 'is', null)
        .order('actioned_at', { ascending: false })
        .limit(30)
      if (error) throw error
      return data as NotificationRow[]
    },
    staleTime: 60 * 1000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useMarkNotificationActioned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const now = new Date().toISOString()
      const supabase = createClient()
      const { error } = await supabase
        .from('notifications')
        .update({ actioned_at: now, read_at: now })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

export function useMarkAllNotificationsActioned() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) throw new Error('Not authenticated')
      const now = new Date().toISOString()
      const supabase = createClient()
      const { error } = await supabase
        .from('notifications')
        .update({ actioned_at: now, read_at: now })
        .eq('profile_id', profileId)
        .is('actioned_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.notifications.all }),
  })
}

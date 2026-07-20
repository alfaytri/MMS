// src/hooks/useNotifications.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'

type NotificationTemplate = DBTable<'notification_templates'>
type ReminderCategory = DBTable<'reminder_categories'>
type Reminder = DBTable<'reminders'>
type ReminderInsert = {
  category_id: string
  name: string
  channel?: DBTable<'reminders'>['channel']
  description?: string | null
  name_ar?: string | null
  status?: DBTable<'reminders'>['status']
  template?: string | null
  timing?: string | null
}
type ReminderUpdate = Partial<ReminderInsert>

export type { NotificationTemplate, ReminderCategory, Reminder }

export function useNotificationTemplates() {
  return useQuery({
    queryKey: queryKeys.notifications.templates,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .order('slug')
        .limit(500)
      if (error) throw error
      return (data ?? []) as NotificationTemplate[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useReminderCategories() {
  return useQuery({
    queryKey: queryKeys.notifications.reminderCategories,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reminder_categories')
        .select('*')
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as ReminderCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useReminders() {
  return useQuery({
    queryKey: queryKeys.notifications.reminders,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .order('category_id')
        .order('created_at')
        .limit(200)
      if (error) throw error
      return (data ?? []) as Reminder[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: ReminderInsert) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reminders')
        .insert(values)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.reminders }),
  })
}

export function useUpdateReminder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: ReminderUpdate & { id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.from('reminders')
        .update(values)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notifications.reminders }),
  })
}

// ---------------------------------------------------------------------------
// In-app notification inbox (approval-chain notifications table)
// ---------------------------------------------------------------------------

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

// src/hooks/useNotifications.ts
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert } from '@/types/database.types'

type NotificationTemplate = DBTable<'notification_templates'>
type ReminderCategory = DBTable<'reminder_categories'>
type Reminder = DBTable<'reminders'>
type ReminderInsert = Omit<DBInsert<'reminders'>, 'id' | 'created_at' | 'updated_at'>
type ReminderUpdate = Partial<ReminderInsert>

export type { NotificationTemplate, ReminderCategory, Reminder }

export function useNotificationTemplates() {
  return useQuery({
    queryKey: ['notification_templates'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notification_templates')
        .select('*')
        .order('slug')
      if (error) throw error
      return (data ?? []) as NotificationTemplate[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useReminderCategories() {
  return useQuery({
    queryKey: ['reminder_categories'],
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
    queryKey: ['reminders'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .order('category_id')
        .order('created_at')
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
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
  created_at: string
}

async function getMyProfileId(): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await (supabase as any)
    .from('profiles').select('id').eq('auth_user_id', user.id).maybeSingle()
  return data?.id ?? null
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return 0
      const supabase = createClient()
      const { count, error } = await (supabase as any)
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .is('read_at', null)
      if (error) throw error
      return count ?? 0
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useRecentNotifications() {
  return useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) return [] as NotificationRow[]
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('notifications')
        .select('*')
        .eq('profile_id', profileId)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) throw error
      return data as NotificationRow[]
    },
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const profileId = await getMyProfileId()
      if (!profileId) throw new Error('Not authenticated')
      const supabase = createClient()
      const { error } = await (supabase as any)
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('profile_id', profileId)
        .is('read_at', null)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}

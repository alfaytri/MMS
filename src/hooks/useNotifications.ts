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

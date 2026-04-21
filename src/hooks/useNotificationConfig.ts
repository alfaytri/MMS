'use client'

import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createClient } from '@/lib/supabase/client'

export type NotificationConfigRow = {
  id: string
  slug: string
  category: string
  label: string
  labelAr: string | null
  notes: string | null
  templateName: string
  templateSlug: string
  bodyText: string | null
  mediaType: string
  triggerType: string
  timingDescription: string | null
  isActive: boolean
}

export type UseNotificationConfigReturn = {
  grouped: Record<string, NotificationConfigRow[]>
  loading: boolean
  error: string | null
  toggleActive: (id: string, isActive: boolean) => Promise<boolean>
}

const QUERY_KEY = ['notification_config'] as const

export function useNotificationConfig(): UseNotificationConfigReturn {
  const queryClient = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('notification_config')
        .select(`
          id, slug, label, label_ar, notes, category,
          trigger_type, timing_description, is_active, sort_order,
          notification_templates!notification_config_template_slug_fkey (
            wati_template_name, slug, media_type, body_text
          )
        `)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as Array<{
        id: string
        slug: string
        label: string
        label_ar: string | null
        notes: string | null
        category: string
        trigger_type: string
        timing_description: string | null
        is_active: boolean
        sort_order: number
        notification_templates: {
          wati_template_name: string
          slug: string
          media_type: string
          body_text: string | null
        } | null
      }>
    },
    staleTime: 5 * 60 * 1000,
  })

  const grouped = useMemo(() => {
    if (!data) return {}
    const rows: NotificationConfigRow[] = data.map((row) => ({
      id: row.id,
      slug: row.slug,
      category: row.category,
      label: row.label,
      labelAr: row.label_ar,
      notes: row.notes,
      templateName: row.notification_templates?.wati_template_name ?? row.slug,
      templateSlug: row.notification_templates?.slug ?? row.slug,
      bodyText: row.notification_templates?.body_text ?? null,
      mediaType: row.notification_templates?.media_type ?? 'none',
      triggerType: row.trigger_type,
      timingDescription: row.timing_description,
      isActive: row.is_active,
    }))

    // Group by category, sort groups by min sort_order with alpha tie-break
    const acc: Record<string, NotificationConfigRow[]> = {}
    for (const row of rows) {
      if (!acc[row.category]) acc[row.category] = []
      acc[row.category].push(row)
    }

    // compute min sort_order per category from raw data
    const minSortOrder: Record<string, number> = {}
    for (const row of data) {
      const cat = row.category
      if (minSortOrder[cat] === undefined || row.sort_order < minSortOrder[cat]) {
        minSortOrder[cat] = row.sort_order
      }
    }

    return Object.fromEntries(
      Object.entries(acc).sort(([catA], [catB]) => {
        const diff = (minSortOrder[catA] ?? 0) - (minSortOrder[catB] ?? 0)
        return diff !== 0 ? diff : catA.localeCompare(catB)
      })
    )
  }, [data])

  const mutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('notification_config')
        .update({ is_active: isActive })
        .eq('id', id)
      if (error) throw error
    },
    onMutate: async ({ id, isActive }) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY })
      const snapshot = queryClient.getQueryData(QUERY_KEY)
      const slug = (snapshot as Array<{ id: string; slug: string }> | undefined)?.find(
        (r) => r.id === id
      )?.slug ?? id
      queryClient.setQueryData(QUERY_KEY, (old: typeof data) =>
        old?.map((r) => (r.id === id ? { ...r, is_active: isActive } : r))
      )
      return { snapshot, slug }
    },
    onSuccess: async (_data, { id, isActive }, context) => {
      try {
        const supabase = createClient()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('activity_log') as any).insert({
          action: 'services/notification-toggled',
          module: 'services',
          entity_type: 'notification_config',
          entity_id: id,
          details: JSON.stringify({ slug: context?.slug, is_active: isActive }),
        })
      } catch {
        // best-effort — must not re-throw (would trigger onError and revert the optimistic update)
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData(QUERY_KEY, context.snapshot)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })

  const toggleActive = async (id: string, isActive: boolean): Promise<boolean> => {
    try {
      await mutation.mutateAsync({ id, isActive })
      toast.success(isActive ? 'Notification enabled' : 'Notification disabled')
      return true
    } catch {
      toast.error('Error toggling notification')
      return false
    }
  }

  return {
    grouped,
    loading: isLoading,
    error: error ? (error as Error).message : null,
    toggleActive,
  }
}

// src/hooks/useReminderTemplates.ts
// Month-based service reminder templates + the reminder config (test-number lock
// / enable flag). reminder_templates isn't in the generated types yet (migration
// 20261087) — the table name is cast until types are regenerated.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database.types'

export interface ReminderTemplate {
  id: string
  name: string
  wati_template_name: string | null
  interval_months: number
  param_names: string[]
  active: boolean
}

export interface ReminderConfig {
  enabled: boolean
  test_number: string | null
}

const TPL_KEY = ['reminder-templates'] as const
const CFG_KEY = ['app_settings', 'reminder_config'] as const

export function useReminderTemplates() {
  return useQuery<ReminderTemplate[]>({
    queryKey: TPL_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = (await supabase
        .from('reminder_templates' as never)
        .select('id, name, wati_template_name, interval_months, param_names, active')
        .order('name')) as unknown as { data: ReminderTemplate[] | null; error: Error | null }
      if (error) throw error
      return (data ?? []).map((t) => ({ ...t, param_names: Array.isArray(t.param_names) ? t.param_names : [] }))
    },
  })
}

export function useSaveReminderTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (t: Partial<ReminderTemplate> & { name: string }) => {
      const supabase = createClient()
      const payload = {
        name: t.name,
        wati_template_name: t.wati_template_name ?? null,
        interval_months: Math.max(1, Number(t.interval_months) || 12),
        param_names: (t.param_names ?? ['customer_name', 'service_name']) as unknown as Json,
        active: t.active ?? true,
        updated_at: new Date().toISOString(),
      }
      const q = t.id
        ? supabase.from('reminder_templates' as never).update(payload as never).eq('id' as never, t.id as never).select('id')
        : supabase.from('reminder_templates' as never).insert(payload as never).select('id')
      const { data, error } = (await q) as unknown as { data: { id: string }[] | null; error: Error | null }
      if (error) throw error
      return t.id ?? data?.[0]?.id ?? null
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TPL_KEY }),
  })
}

export function useDeleteReminderTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { error } = (await supabase
        .from('reminder_templates' as never).delete().eq('id' as never, id as never)) as unknown as { error: Error | null }
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: TPL_KEY }),
  })
}

export interface ReminderServiceRow { id: string; name_en: string; reminder_template_id: string | null }

/** Active services + which reminder template (if any) each is assigned to. */
export function useServicesForReminder() {
  return useQuery<ReminderServiceRow[]>({
    queryKey: ['services-for-reminder'],
    staleTime: 30_000,
    queryFn: async () => {
      const supabase = createClient()
      // .from(... as never) so the (un-typed) reminder_template_id column in the
      // select string is not compile-checked against the stale generated types.
      const { data, error } = (await supabase
        .from('services' as never)
        .select('id, name_en, reminder_template_id')
        .eq('status' as never, 'active' as never)
        .is('deleted_at' as never, null as never)
        .order('name_en' as never)) as unknown as { data: ReminderServiceRow[] | null; error: Error | null }
      if (error) throw error
      return data ?? []
    },
  })
}

/** Point a set of services at a reminder template (or clear them with null). */
export function useSetServicesReminder() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ serviceIds, templateId }: { serviceIds: string[]; templateId: string | null }) => {
      if (serviceIds.length === 0) return
      const supabase = createClient()
      const { error } = (await supabase
        .from('services' as never)
        .update({ reminder_template_id: templateId } as never)
        .in('id' as never, serviceIds as never)) as unknown as { error: Error | null }
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services-for-reminder'] })
      qc.invalidateQueries({ queryKey: ['reminder-templates'] })
    },
  })
}

export function useReminderConfig() {
  return useQuery<ReminderConfig>({
    queryKey: CFG_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase.from('app_settings').select('value').eq('key', 'reminder_config').maybeSingle()
      const v = (data?.value ?? {}) as Partial<ReminderConfig>
      return { enabled: v.enabled !== false, test_number: (v.test_number ?? '') || null }
    },
  })
}

export function useSaveReminderConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cfg: ReminderConfig) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'reminder_config', value: { enabled: cfg.enabled, test_number: cfg.test_number?.trim() || null } as unknown as Json }, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CFG_KEY }),
  })
}

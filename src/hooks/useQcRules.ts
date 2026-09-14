// QC scoring config — the editable point rules (qc_point_rules table) and the
// trigger/capacity settings (app_settings key 'qc_config'). Mirrors the
// customer-risk app_settings read/upsert pattern. `qc_point_rules` isn't in the
// generated database.types.ts yet (added by migration 20261082) — the table name
// is cast until types are regenerated; the row shape is typed locally.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { Json } from '@/types/database.types'

export type QcTiming = 'before' | 'along' | 'after'

export type QcPointRule = {
  id: string
  scenario: string
  label: string
  points: number
  timing: QcTiming
  active: boolean
  sort_order: number
}

export type QcConfig = {
  threshold: number
  max_qc_per_day: number
  same_site_mode: 'combine' | 'separate'
  // When ON, flagging a post-completion QC for rework auto-creates the backwork
  // redo order; when OFF (default) the call centre books the redo. (A3)
  auto_backwork_on_rework: boolean
}

export const QC_TIMING_LABELS: Record<QcTiming, string> = {
  before: 'Before the team',
  along:  'Along with the team',
  after:  'After the team',
}

const RULES_KEY = ['qc_point_rules'] as const
const CONFIG_KEY = ['app_settings', 'qc_config'] as const
export const DEFAULT_QC_CONFIG: QcConfig = { threshold: 5, max_qc_per_day: 3, same_site_mode: 'combine', auto_backwork_on_rework: false }

// ─── Point rules ────────────────────────────────────────────────────────────
export function useQcPointRules() {
  return useQuery<QcPointRule[]>({
    queryKey: RULES_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = (await supabase
        .from('qc_point_rules' as never)
        .select('id, scenario, label, points, timing, active, sort_order')
        .order('sort_order', { ascending: true })) as unknown as { data: QcPointRule[] | null; error: Error | null }
      if (error) throw error
      return data ?? []
    },
  })
}

export function useSaveQcPointRules() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rules: Pick<QcPointRule, 'id' | 'points' | 'timing' | 'active'>[]) => {
      const supabase = createClient()
      for (const r of rules) {
        const { error } = (await supabase
          .from('qc_point_rules' as never)
          .update({ points: r.points, timing: r.timing, active: r.active, updated_at: new Date().toISOString() } as never)
          .eq('id' as never, r.id as never)) as unknown as { error: Error | null }
        if (error) throw error
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: RULES_KEY }),
  })
}

// ─── Config (threshold / capacity / same-site) ──────────────────────────────
export function useQcConfig() {
  return useQuery<QcConfig>({
    queryKey: CONFIG_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'qc_config')
        .maybeSingle()
      const v = (data?.value ?? {}) as Partial<QcConfig>
      const num = (x: unknown, fallback: number) => (Number.isFinite(Number(x)) ? Number(x) : fallback)
      return {
        threshold:      Math.max(1, num(v.threshold, DEFAULT_QC_CONFIG.threshold)),
        max_qc_per_day: Math.max(1, num(v.max_qc_per_day, DEFAULT_QC_CONFIG.max_qc_per_day)),
        same_site_mode: v.same_site_mode === 'separate' ? 'separate' : 'combine',
        auto_backwork_on_rework: v.auto_backwork_on_rework === true,
      }
    },
  })
}

export function useSaveQcConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cfg: QcConfig) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: 'qc_config', value: cfg as unknown as Json }, { onConflict: 'key' })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: CONFIG_KEY }),
  })
}

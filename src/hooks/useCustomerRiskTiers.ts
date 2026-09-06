// src/hooks/useCustomerRiskTiers.ts
// Loads / saves the configurable customer risk tiers from app_settings
// (key 'customer_risk_tiers', value { tiers: RiskTier[] }). Mirrors the
// OrderQuotationSettingsAdmin app_settings read/upsert pattern. Falls back to
// DEFAULT_RISK_TIERS when nothing is configured.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { DEFAULT_RISK_TIERS, type RiskTier } from '@/lib/customers/risk'
import type { Json } from '@/types/database.types'

const SETTING_KEY = 'customer_risk_tiers'
const QUERY_KEY = ['app_settings', SETTING_KEY] as const

function normalize(raw: unknown): RiskTier[] {
  const arr = Array.isArray(raw) ? raw : []
  const tiers = arr
    .map((r): RiskTier | null => {
      const t = r as Partial<RiskTier>
      if (typeof t.label !== 'string' || t.label.trim() === '') return null
      const min = Number(t.min_days)
      if (!Number.isFinite(min) || min < 0) return null
      return {
        id: String(t.id ?? t.label).trim() || t.label,
        label: t.label,
        min_days: Math.floor(min),
        color: typeof t.color === 'string' && t.color ? t.color : '#888780',
        requires_approval: t.requires_approval === true,
      }
    })
    .filter((t): t is RiskTier => t !== null)
    .sort((a, b) => a.min_days - b.min_days)
  return tiers.length > 0 ? tiers : DEFAULT_RISK_TIERS
}

export function useCustomerRiskTiers() {
  return useQuery<RiskTier[]>({
    queryKey: QUERY_KEY,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', SETTING_KEY)
        .maybeSingle()
      const value = (data?.value as { tiers?: unknown } | null)
      return normalize(value?.tiers)
    },
  })
}

export function useSaveCustomerRiskTiers() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (tiers: RiskTier[]) => {
      const supabase = createClient()
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          { key: SETTING_KEY, value: { tiers } as unknown as Json },
          { onConflict: 'key' },
        )
      if (error) throw error
      return tiers
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY })
    },
  })
}

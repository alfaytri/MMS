// src/hooks/usePromotions.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable } from '@/types/database.types'

type PromotionCampaign = DBTable<'promotion_campaigns'>
type PromotionRule = DBTable<'promotion_rules'>
type Voucher = DBTable<'vouchers'>

export type CampaignWithRules = PromotionCampaign & {
  promotion_rules: PromotionRule[]
}

export type VoucherWithCampaign = Voucher & {
  promotion_campaigns: { name: string } | null
}

export type { PromotionCampaign, PromotionRule, Voucher }

export function usePromotionCampaigns(enabled = true) {
  return useQuery({
    queryKey: ['promotion_campaigns'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('promotion_campaigns')
        .select('*, promotion_rules(*)')
        .order('start_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as CampaignWithRules[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useVouchers(enabled = true) {
  return useQuery({
    queryKey: ['vouchers'],
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('vouchers')
        .select('*, promotion_campaigns(name)')
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as VoucherWithCampaign[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

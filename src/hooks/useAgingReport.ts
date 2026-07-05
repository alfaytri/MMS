'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type AgingRow = {
  supplier_id?: string
  supplier_name?: string
  customer_id?: string
  customer_name?: string
  current_amt: number
  days_1_30: number
  days_31_60: number
  days_61_90: number
  days_over_90: number
  total_outstanding: number
  bill_count?: number
  invoice_count?: number
}

export function usePurchaseAgingReport() {
  return useQuery({
    queryKey: queryKeys.finance.purchaseAging,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_purchase_aging_report' as any)
      if (error) throw error
      return (data ?? []) as AgingRow[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useSalesAgingReport() {
  return useQuery({
    queryKey: queryKeys.finance.salesAging,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_sales_aging_report' as any)
      if (error) throw error
      return (data ?? []) as AgingRow[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

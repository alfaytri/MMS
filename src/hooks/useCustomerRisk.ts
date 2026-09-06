// src/hooks/useCustomerRisk.ts
// Resolve ONE customer's risk tier by id, for surfaces that have a customer_id
// but not the pending date (order booking, contact-centre card). Backed by the
// get_customer_pending_summary RPC + the configurable tiers.
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCustomerRiskTiers } from '@/hooks/useCustomerRiskTiers'
import { resolveRiskTier, type RiskTier } from '@/lib/customers/risk'

export interface CustomerPendingSummary {
  oldest_pending_date: string | null
  total_pending: number
  invoice_count: number
}

const EMPTY: CustomerPendingSummary = { oldest_pending_date: null, total_pending: 0, invoice_count: 0 }

export function useCustomerRisk(customerId?: string | null): {
  tier: RiskTier | null
  summary: CustomerPendingSummary
  isLoading: boolean
} {
  const { data: tiers = [] } = useCustomerRiskTiers()

  const q = useQuery<CustomerPendingSummary>({
    queryKey: ['customer-pending-summary', customerId],
    enabled: !!customerId,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc(
        'get_customer_pending_summary' as never,
        { p_customer_id: customerId } as never,
      )
      if (error) throw error
      const row = (Array.isArray(data) ? data[0] : data) as CustomerPendingSummary | null
      return row ?? EMPTY
    },
  })

  const summary = q.data ?? EMPTY
  const tier = customerId ? resolveRiskTier(summary.oldest_pending_date, tiers) : null
  return { tier, summary, isLoading: q.isLoading }
}

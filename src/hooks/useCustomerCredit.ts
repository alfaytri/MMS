'use client'

/**
 * Reads from the live `customer_credit_summary` view.
 *
 * Always correct — the view is computed from outstanding AR invoices +
 * uninvoiced SOs, so paying an invoice frees up credit on the next read.
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CustomerCreditSummary {
  customer_id:            string
  customer_name:          string
  customer_name_ar:       string | null
  customer_type:          'cash' | 'credit' | null
  is_blocked:             boolean
  credit_group_id:        string | null
  credit_group_name:      string | null
  credit_limit:           number
  credit_used:            number
  credit_available:       number
  credit_utilization_pct: number | null
}

/** Bulk credit summary — used to enrich the customer list table. */
export function useAllCustomerCredit() {
  return useQuery({
    queryKey: ['customer-credit-summary', 'all'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_credit_summary')
        .select('*')
        .order('customer_name')
      if (error) throw error
      return (data ?? []) as CustomerCreditSummary[]
    },
    staleTime: 30 * 1000,
  })
}

/**
 * Single-customer credit summary. Returns null when no customer is selected
 * yet so the SO-create page can render an inline pill without flicker.
 */
export function useCustomerCredit(customerId: string | null | undefined) {
  return useQuery({
    queryKey: ['customer-credit-summary', 'one', customerId ?? null],
    enabled: !!customerId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_credit_summary')
        .select('*')
        .eq('customer_id', customerId!)
        .maybeSingle()
      if (error) throw error
      return (data as CustomerCreditSummary | null) ?? null
    },
    staleTime: 30 * 1000,
  })
}

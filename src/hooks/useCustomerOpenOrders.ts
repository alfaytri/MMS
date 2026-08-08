'use client'

/**
 * Lightweight hook for the Credit Utilization detail dialog.
 * Fetches every non-cancelled SO for a customer with just the fields
 * the dialog needs, joined to `so_invoices.paid_amount` (authoritative
 * for invoiced SOs after the payments-rehome trigger).
 */

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export interface CustomerOpenOrder {
  id:            string
  so_number:     string
  status:        string
  total:         number
  exchange_rate: number
  currency:      string
  created_at:    string
  paid_amount:   number
}

export function useCustomerOpenOrders(customerId: string | null | undefined) {
  return useQuery<CustomerOpenOrder[]>({
    queryKey: ['customer-open-orders', customerId ?? null],
    enabled:  !!customerId,
    queryFn: async () => {
      const supabase = createClient()
      // Fetch SOs + their paid totals from the compute-on-demand view.
      const [soRes, paidRes] = await Promise.all([
        supabase
          .from('sale_orders')
          .select('id, so_number, status, total, exchange_rate, currency, created_at')
          .eq('customer_id', customerId!)
          .is('deleted_at', null)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('sale_order_paid_summary')
          .select('sale_order_id, paid_qar'),
      ])
      if (soRes.error) throw soRes.error
      const paidMap = new Map<string, number>()
      for (const row of paidRes.data ?? []) {
        if (row.sale_order_id) paidMap.set(row.sale_order_id, Number(row.paid_qar ?? 0))
      }
      return (soRes.data ?? []).map((r) => {
        const rate = Number(r.exchange_rate ?? 1)
        const paidQar = paidMap.get(r.id as string) ?? 0
        // Convert paid QAR back to the SO's currency so the per-order UI
        // stays consistent (each mini-bar renders in the SO's currency).
        const paidLocal = rate > 0 ? paidQar / rate : paidQar
        return {
          id:            r.id as string,
          so_number:     r.so_number as string,
          status:        r.status as string,
          total:         Number(r.total ?? 0),
          exchange_rate: rate,
          currency:      (r.currency as string) ?? 'QAR',
          created_at:    r.created_at as string,
          paid_amount:   paidLocal,
        }
      })
    },
    staleTime: 30 * 1000,
  })
}

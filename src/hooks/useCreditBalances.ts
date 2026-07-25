'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditBalanceRow = {
  party_id:    string
  currency:    string
  open_count:  number
  open_amount: number
}

/**
 * What suppliers owe us — open debit-note credit balances, grouped per
 * (supplier, currency). Backed by the supplier_credit_balances view.
 */
export function useSupplierCreditBalances() {
  return useQuery({
    queryKey: ['supplier-credit-balances'],
    queryFn: async (): Promise<CreditBalanceRow[]> => {
      const supabase = createClient()
      const { data, error } = await (supabase
        .from('supplier_credit_balances' as never)
        .select('supplier_id, currency, open_count, open_amount') as unknown as Promise<{
          data: { supplier_id: string; currency: string; open_count: number; open_amount: number }[] | null
          error: { message: string } | null
        }>)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => ({
        party_id:    r.supplier_id,
        currency:    r.currency,
        open_count:  r.open_count,
        open_amount: Number(r.open_amount ?? 0),
      }))
    },
    staleTime: 60_000,
  })
}

/**
 * What WE owe customers — open store-credit balances, grouped per
 * (customer, currency). Backed by the customer_credit_balances view.
 */
export function useCustomerCreditBalances() {
  return useQuery({
    queryKey: ['customer-credit-balances'],
    queryFn: async (): Promise<CreditBalanceRow[]> => {
      const supabase = createClient()
      const { data, error } = await (supabase
        .from('customer_credit_balances' as never)
        .select('customer_id, currency, open_count, open_amount') as unknown as Promise<{
          data: { customer_id: string; currency: string; open_count: number; open_amount: number }[] | null
          error: { message: string } | null
        }>)
      if (error) throw new Error(error.message)
      return (data ?? []).map((r) => ({
        party_id:    r.customer_id,
        currency:    r.currency,
        open_count:  r.open_count,
        open_amount: Number(r.open_amount ?? 0),
      }))
    },
    staleTime: 60_000,
  })
}

/**
 * Group a flat list of balance rows into a Map<party_id, rows[]> keyed by
 * party. Each supplier/customer may hold balances in multiple currencies.
 */
export function groupBalancesByParty(rows: CreditBalanceRow[]): Map<string, CreditBalanceRow[]> {
  const map = new Map<string, CreditBalanceRow[]>()
  for (const r of rows) {
    const existing = map.get(r.party_id)
    if (existing) existing.push(r)
    else map.set(r.party_id, [r])
  }
  return map
}

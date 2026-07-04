'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type StatementRow = {
  txn_date: string
  txn_type: 'invoice' | 'payment' | 'credit_note'
  reference: string
  description: string
  debit: number
  credit: number
}

export type StatementRowWithBalance = StatementRow & {
  balance: number
}

export function useCustomerStatement(
  customerId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
) {
  return useQuery({
    queryKey: queryKeys.finance.customerStatement(customerId, dateFrom, dateTo),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_customer_statement', {
        p_customer_id: customerId!,
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
      })
      if (error) throw error

      const rows = (data ?? []) as StatementRow[]
      let balance = 0
      return rows.map((row) => {
        balance += row.debit - row.credit
        return { ...row, balance } as StatementRowWithBalance
      })
    },
    enabled: !!customerId,
    staleTime: 5 * 60 * 1000,
  })
}

export function useCustomerList() {
  return useQuery({
    queryKey: ['customers-select-list'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customers')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
        .limit(500)
      if (error) throw error
      return data as { id: string; name: string }[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

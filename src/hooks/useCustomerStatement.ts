'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type StatementOrder = {
  id:          string
  so_number:   string
  created_at:  string
  status:      string
  total:       number
  paid:        number
  outstanding: number
}

export type StatementData = {
  customer: {
    name:         string
    phone:        string | null
    account_type: string
  }
  orders: StatementOrder[]
  totals: {
    total_orders_value: number
    total_paid:         number
    total_outstanding:  number
  }
  open_orders_count: number
}

export function useCustomerStatement(customerId: string | null) {
  return useQuery({
    queryKey: ['customer-statement-v2', customerId],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_customer_statement_v2' as any, {
        p_customer_id: customerId!,
      })
      if (error) throw error
      return data as StatementData
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

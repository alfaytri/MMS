'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'

export type FinancialSummary = {
  total: number
  overdue: number
  overdue_count: number
}

export type CashThisMonth = {
  in: number
  out: number
  net: number
  in_prev: number
  out_prev: number
  invoiced: number
  billed: number
}

export type MonthlyTrend = {
  month: string
  label: string
  invoiced: number
  billed: number
  collected: number
  paid_out: number
}

export type TopOverdue = {
  id: string
  name: string
  amount: number
  invoice_count?: number
  bill_count?: number
  oldest_due: string
  days_overdue: number
}

export type FinancialDashboardData = {
  receivables: FinancialSummary
  payables: FinancialSummary
  cash_this_month: CashThisMonth
  monthly_trend: MonthlyTrend[]
  top_overdue_customers: TopOverdue[]
  top_overdue_suppliers: TopOverdue[]
}

export function useFinancialDashboard() {
  return useQuery({
    queryKey: queryKeys.finance.dashboard,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_financial_dashboard')
      if (error) throw error
      return data as FinancialDashboardData
    },
    staleTime: 5 * 60 * 1000,
  })
}

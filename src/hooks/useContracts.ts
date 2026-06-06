'use client'

import { useInfiniteQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { LiveContractSummary, ContractFilters } from '@/types/contracts'
import { queryKeys } from '@/lib/queryKeys'

const PAGE_SIZE = 50

export function useContracts(filters?: ContractFilters) {
  const supabase = createClient()

  return useInfiniteQuery({
    queryKey: queryKeys.contracts.list(filters),
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('contracts')
        .select(`
          *,
          contract_visits(id, scheduled_date, service_name, team_id, completed, teams(name_en)),
          contract_payments(id, due_date, amount, status)
        `)
        .in(
          'status',
          filters?.status?.length
            ? filters.status
            : ['active', 'expiring_soon', 'overdue_payment', 'completed', 'cancelled'],
        )

      if (filters?.contractNumber)
        query = query.ilike('contract_id', `%${filters.contractNumber}%`)
      if (filters?.customer)
        query = query.ilike('customer_name', `%${filters.customer}%`)
      if (filters?.site) query = query.ilike('site_name', `%${filters.site}%`)
      if (filters?.agent) query = query.eq('agent_name', filters.agent)

      if (filters?.sortBy === 'endDate') {
        query = query.order('end_date', { ascending: filters.sortDir === 'asc' })
      } else {
        query = query.order('created_at', { ascending: false })
      }

      const from = pageParam * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await query.range(from, to)
      if (error) throw error

      const today = new Date().toISOString().split('T')[0]

      let contracts: LiveContractSummary[] = (data || []).map((c: any) => {
        const visits = c.contract_visits || []
        const payments = c.contract_payments || []
        const completedVisits = visits.filter((v: any) => v.completed).length
        const futureVisits = visits
          .filter((v: any) => !v.completed && v.scheduled_date >= today)
          .sort((a: any, b: any) => a.scheduled_date.localeCompare(b.scheduled_date))
          .slice(0, 6)
          .map((v: any) => ({
            date: v.scheduled_date,
            service_name: v.service_name,
            team_name: v.teams?.name_en,
          }))

        const paidAmount = payments
          .filter((p: any) => p.status === 'paid')
          .reduce((sum: number, p: any) => sum + (p.amount || 0), 0)
        const totalPayments = payments.reduce(
          (sum: number, p: any) => sum + (p.amount || 0),
          0,
        )

        return {
          id: c.id,
          contract_id: c.contract_id || '',
          status: c.status,
          customer_name: c.customer_name || '',
          site_name: c.site_name || '',
          phone: c.phone || '',
          agent_name: c.agent_name || '',
          divisions: c.divisions || [],
          services_summary: c.services_summary || '',
          start_date: c.start_date || '',
          end_date: c.end_date || '',
          monthly_value: c.monthly_value || 0,
          total_value: c.total_value || 0,
          total_visits: visits.length,
          completed_visits: completedVisits,
          upcoming_visits: futureVisits,
          total_payments: totalPayments,
          paid_amount: paidAmount,
          payments: payments.map((p: any) => ({
            id: p.id,
            contract_id: c.id,
            due_date: p.due_date,
            amount: p.amount,
            status: p.status || 'pending',
          })),
          payment_schedule: c.payment_schedule || c.payment_frequency || '',
          has_signed_doc: c.has_signed_doc || false,
          area_count: c.area_count || 0,
          cancelled_date: c.cancelled_date,
          cancel_reason: c.cancel_reason,
        }
      })

      if (filters?.sortBy === 'balance') {
        contracts.sort((a, b) =>
          filters.sortDir === 'asc'
            ? (a.total_payments - a.paid_amount) - (b.total_payments - b.paid_amount)
            : (b.total_payments - b.paid_amount) - (a.total_payments - a.paid_amount),
        )
      } else if (filters?.sortBy === 'visits') {
        contracts.sort((a, b) =>
          filters.sortDir === 'asc'
            ? (a.total_visits - a.completed_visits) - (b.total_visits - b.completed_visits)
            : (b.total_visits - b.completed_visits) - (a.total_visits - a.completed_visits),
        )
      }

      const outstandingTotal = contracts
        .filter((c) => c.status === 'active')
        .reduce((sum, c) => sum + (c.total_payments - c.paid_amount), 0)

      const statusCounts: Record<string, number> = {}
      for (const status of ['active', 'expiring_soon', 'overdue_payment', 'completed', 'cancelled']) {
        statusCounts[status] = contracts.filter((c) => c.status === status).length
      }

      return {
        items: contracts,
        outstandingTotal,
        statusCounts,
        nextPage: contracts.length === PAGE_SIZE ? pageParam + 1 : undefined,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextPage,
  })
}

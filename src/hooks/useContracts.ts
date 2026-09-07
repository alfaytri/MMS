'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { LiveContractSummary, ContractFilters, ContractLiveStatus } from '@/types/contracts'
import { queryKeys } from '@/lib/queryKeys'

/** One row of contract_board_summary() (SQL-derived status + aggregates). */
interface BoardRow {
  id: string
  contract_id: string
  stored_status: string
  derived_status: string
  customer_name: string
  site_name: string
  phone: string
  agent_name: string
  divisions: string[]
  services_summary: string
  start_date: string
  end_date: string
  monthly_value: number
  total_value: number
  area_count: number
  has_signed_doc: boolean
  cancelled_date: string | null
  cancel_reason: string | null
  payment_schedule: string
  total_visits: number
  completed_visits: number
  total_payments: number
  paid_amount: number
  overdue_unpaid: boolean
  current_period_unpaid: number
  next_due_date: string | null
  upcoming_visits: { date: string; service_name: string; team_name?: string | null }[]
}

const LIVE_STATUS_KEYS = ['active', 'expiring_soon', 'overdue_payment', 'completed', 'cancelled']
const OUTSTANDING_STATUSES = new Set(['active', 'expiring_soon', 'overdue_payment'])

/**
 * Live-contract board. A single visibility-filtered fetch of compact summaries
 * with a SQL-derived status; counts, outstanding total, filtering and sorting
 * are all computed over the FULL set (not per-page), so the KPIs are global and
 * the query never embeds every child visit row.
 */
export function useContracts(filters?: ContractFilters) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.contracts.list('board'),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('contract_board_summary' as never)
      if (error) throw error

      const rows = (data ?? []) as unknown as BoardRow[]

      const all: LiveContractSummary[] = rows.map((r) => ({
        id: r.id,
        contract_id: r.contract_id || '',
        status: (r.derived_status ?? 'active') as ContractLiveStatus,
        customer_name: r.customer_name || '',
        site_name: r.site_name || '',
        phone: r.phone || '',
        agent_name: r.agent_name || '',
        divisions: r.divisions || [],
        services_summary: r.services_summary || '',
        start_date: r.start_date || '',
        end_date: r.end_date || '',
        monthly_value: r.monthly_value || 0,
        total_value: r.total_value || 0,
        total_visits: r.total_visits || 0,
        completed_visits: r.completed_visits || 0,
        upcoming_visits: (r.upcoming_visits || []).map((v) => ({
          date: v.date,
          service_name: v.service_name,
          team_name: v.team_name ?? undefined,
        })),
        total_payments: r.total_payments || 0,
        paid_amount: r.paid_amount || 0,
        payments: [],
        payment_schedule: r.payment_schedule || '',
        has_signed_doc: r.has_signed_doc || false,
        area_count: r.area_count || 0,
        cancelled_date: r.cancelled_date,
        cancel_reason: r.cancel_reason,
        current_period_unpaid: r.current_period_unpaid || 0,
        overdue_unpaid: r.overdue_unpaid || false,
      }))

      // Global KPIs — computed over every visible live contract.
      const statusCounts: Record<string, number> = {}
      for (const status of LIVE_STATUS_KEYS) {
        statusCounts[status] = all.filter((c) => c.status === status).length
      }
      const outstandingTotal = all
        .filter((c) => OUTSTANDING_STATUSES.has(c.status))
        .reduce((sum, c) => sum + (c.total_payments - c.paid_amount), 0)

      // Client-side filtering (the board already scoped to what the user may see).
      let items = all
      if (filters?.status?.length) {
        const set = new Set(filters.status)
        items = items.filter((c) => set.has(c.status))
      }
      if (filters?.contractNumber) {
        const q = filters.contractNumber.toLowerCase()
        items = items.filter((c) => c.contract_id.toLowerCase().includes(q))
      }
      if (filters?.customer) {
        const q = filters.customer.toLowerCase()
        items = items.filter((c) => c.customer_name.toLowerCase().includes(q))
      }
      if (filters?.site) {
        const q = filters.site.toLowerCase()
        items = items.filter((c) => c.site_name.toLowerCase().includes(q))
      }
      if (filters?.agent) {
        const q = filters.agent.toLowerCase()
        items = items.filter((c) => c.agent_name.toLowerCase().includes(q))
      }

      const dir = filters?.sortDir === 'asc' ? 1 : -1
      if (filters?.sortBy === 'endDate') {
        items = [...items].sort((a, b) => dir * a.end_date.localeCompare(b.end_date))
      } else if (filters?.sortBy === 'balance') {
        items = [...items].sort(
          (a, b) => dir * ((a.total_payments - a.paid_amount) - (b.total_payments - b.paid_amount)),
        )
      } else if (filters?.sortBy === 'visits') {
        items = [...items].sort(
          (a, b) => dir * ((a.total_visits - a.completed_visits) - (b.total_visits - b.completed_visits)),
        )
      } else {
        // Default: most recently ending last-in / keep server order otherwise.
        items = [...items].sort((a, b) => b.end_date.localeCompare(a.end_date))
      }

      return { items, outstandingTotal, statusCounts }
    },
  })
}

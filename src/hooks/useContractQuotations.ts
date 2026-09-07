'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type {
  ContractQuotationSummary,
  ContractQuotationStatus,
  QuotationFilters,
} from '@/types/contracts'

const QUOTATION_STORED_STATUSES: ContractQuotationStatus[] = [
  'draft', 'manager_review', 'customer_pending', 'approved', 'rejected', 'expired',
]
const VALIDITY_DAYS = 30
const OPEN_STATUSES = new Set(['draft', 'manager_review', 'customer_pending'])

/**
 * Derive `expired` at read time: an open quotation (draft / manager_review /
 * customer_pending) whose sent (or created) date is older than the validity
 * window is shown as expired, without any cron writing the status.
 */
function deriveQuotationStatus(
  stored: string,
  sentAt: string | null,
  createdAt: string | null,
): ContractQuotationStatus {
  if (OPEN_STATUSES.has(stored)) {
    const ref = sentAt || createdAt
    if (ref) {
      const ageMs = Date.now() - new Date(ref).getTime()
      if (ageMs > VALIDITY_DAYS * 24 * 60 * 60 * 1000) return 'expired'
    }
  }
  return stored as ContractQuotationStatus
}

export function useContractQuotations(filters?: QuotationFilters) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.contracts.quotations(filters),
    queryFn: async () => {
      // Status is filtered client-side (on the DERIVED status) so derived
      // `expired` rows are filterable; all other filters stay server-side.
      let query = supabase
        .from('contracts')
        .select('*, user_data!created_by(full_name)')
        .in('status', QUOTATION_STORED_STATUSES)
        .order(
          filters?.sortBy === 'value' ? 'total_value' : 'created_at',
          { ascending: filters?.sortDir === 'asc' },
        )

      if (filters?.contractNumber)
        query = query.ilike('quotation_number', `%${filters.contractNumber}%`)
      if (filters?.customer)
        query = query.ilike('customer_name', `%${filters.customer}%`)
      if (filters?.phone) query = query.ilike('phone', `%${filters.phone}%`)
      if (filters?.siteName)
        query = query.ilike('site_name', `%${filters.siteName}%`)
      if (filters?.agent) query = query.eq('agent_name', filters.agent)
      if (filters?.dateFrom)
        query = query.gte('created_at', filters.dateFrom)
      if (filters?.dateTo) query = query.lte('created_at', filters.dateTo)

      const { data, error } = await query.limit(500)
      if (error) throw error

      const all: ContractQuotationSummary[] = (data || []).map((c) => ({
        id: c.id,
        quotation_number: c.quotation_number || '',
        status: deriveQuotationStatus(c.status ?? 'draft', c.sent_at, c.created_at),
        customer_name: c.customer_name || '',
        site_name: c.site_name || '',
        phone: c.phone || '',
        agent_name: c.user_data?.full_name || c.agent_name || '',
        divisions: c.divisions || [],
        services_summary: c.services_summary || '',
        start_date: c.start_date || '',
        end_date: c.end_date || '',
        total_value: c.total_value || 0,
        monthly_value: c.monthly_value || 0,
        payment_schedule: c.payment_frequency || '',
        area_count: c.area_count || 0,
        total_visits: c.total_visits || 0,
        has_signed_doc: c.has_signed_doc || false,
        created_at: c.created_at || '',
      }))

      // Counts + pipeline over the full (derived) set, before status filtering.
      const pipelineValue = all.reduce((sum, q) => sum + q.total_value, 0)
      const statusCounts: Record<string, number> = {}
      for (const status of QUOTATION_STORED_STATUSES) {
        statusCounts[status] = all.filter((q) => q.status === status).length
      }

      const quotations = filters?.status?.length
        ? all.filter((q) => filters.status!.includes(q.status))
        : all

      return { data: quotations, pipelineValue, statusCounts }
    },
  })
}

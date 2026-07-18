'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type {
  ContractQuotationSummary,
  ContractQuotationStatus,
  QuotationFilters,
} from '@/types/contracts'

export function useContractQuotations(filters?: QuotationFilters) {
  const supabase = createClient()

  return useQuery({
    queryKey: queryKeys.contracts.quotations(filters),
    queryFn: async () => {
      let query = supabase
        .from('contracts')
        .select('*, profiles!created_by(full_name)')
        .in(
          'status',
          filters?.status?.length
            ? filters.status
            : ['draft', 'manager_review', 'customer_pending', 'approved', 'rejected', 'expired'],
        )
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

      const { data, error } = await query.limit(200)
      if (error) throw error

      const quotations: ContractQuotationSummary[] = (data || []).map(
        (c) => ({
          id: c.id,
          quotation_number: c.quotation_number || '',
          status: (c.status ?? 'draft') as ContractQuotationStatus,
          customer_name: c.customer_name || '',
          site_name: c.site_name || '',
          phone: c.phone || '',
          agent_name: c.profiles?.full_name || c.agent_name || '',
          divisions: c.divisions || [],
          services_summary: c.services_summary || '',
          start_date: c.start_date || '',
          end_date: c.end_date || '',
          total_value: c.total_value || 0,
          monthly_value: c.monthly_value || 0,
          payment_schedule: c.payment_schedule || c.payment_frequency || '',
          area_count: c.area_count || 0,
          total_visits: c.total_visits || 0,
          has_signed_doc: c.has_signed_doc || false,
          created_at: c.created_at || '',
        }),
      )

      const pipelineValue = quotations.reduce(
        (sum, q) => sum + q.total_value,
        0,
      )

      const statusCounts: Record<string, number> = {}
      for (const status of [
        'draft', 'manager_review', 'customer_pending', 'approved', 'rejected', 'expired',
      ]) {
        statusCounts[status] = quotations.filter(
          (q) => q.status === status,
        ).length
      }

      return { data: quotations, pipelineValue, statusCounts }
    },
  })
}

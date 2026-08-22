// src/hooks/useQuotations.ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationListItem, QuotationsFilter } from '@/types/quotations'
import { queryKeys } from '@/lib/queryKeys'

const PAGE_SIZE = 50
const DEFAULT_FILTER: QuotationsFilter = {}

export interface QuotationCounts {
  all: number
  draft: number
  sent: number
}

export function useQuotations(filter: QuotationsFilter = DEFAULT_FILTER) {
  const supabase = createClient()

  return useInfiniteQuery({
    queryKey: queryKeys.quotations.list(filter),
    queryFn: async ({ pageParam = 0 }) => {
      let q = supabase
        .from('order_quotations')
        .select(`
          id, quotation_id, division, status, total_amount, created_date,
          service_customers(name, service_customer_phones(phone))
        `)
        .order('created_at', { ascending: false })

      if (filter.statuses?.length) q = q.in('status', filter.statuses)
      if (filter.division)         q = q.eq('division', filter.division)
      if (filter.dateFrom)         q = q.gte('created_date', filter.dateFrom)
      if (filter.dateTo)           q = q.lte('created_date', filter.dateTo)
      if (filter.quotationNumber)  q = q.ilike('quotation_id', `%${filter.quotationNumber}%`)
      // NOTE: filter.customerPhone requires a cross-table filter not supported by
      // PostgREST nested-table syntax — apply client-side after fetch if needed.

      const from = pageParam * PAGE_SIZE
      const to = from + PAGE_SIZE - 1
      const { data, error } = await q.range(from, to)
      if (error) throw error

      let rows = data ?? []
      if (filter.customerPhone) {
        const ph = filter.customerPhone.replace(/\s+/g, '').toLowerCase()
        rows = rows.filter((r) =>
          (r.service_customers?.service_customer_phones ?? []).some((cp) =>
            (cp.phone ?? '').replace(/\s+/g, '').toLowerCase().includes(ph)
          )
        )
      }

      const items: QuotationListItem[] = rows.map((r) => ({
        id:             r.id,
        quotation_id:   r.quotation_id,
        customer_name:  r.service_customers?.name ?? '—',
        customer_phone: r.service_customers?.service_customer_phones?.[0]?.phone ?? '—',
        division:       r.division ?? '—',
        status:         (r.status ?? 'draft') as QuotationListItem['status'],
        total_amount:   r.total_amount ?? 0,
        created_date:   r.created_date ?? '',
      }))

      return {
        items,
        nextPage: (data?.length ?? 0) === PAGE_SIZE ? pageParam + 1 : undefined,
      }
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage?.nextPage,
  })
}

export function useQuotationCounts() {
  const supabase = createClient()

  return useQuery<QuotationCounts>({
    queryKey: queryKeys.quotations.counts,
    queryFn: async () => {
      const [all, draft, sent] = await Promise.all([
        supabase.from('order_quotations').select('id', { count: 'exact', head: true }),
        supabase
          .from('order_quotations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'draft'),
        supabase
          .from('order_quotations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'sent'),
      ])
      return {
        all:   all.count   ?? 0,
        draft: draft.count ?? 0,
        sent:  sent.count  ?? 0,
      }
    },
    staleTime: 30 * 1000,
  })
}

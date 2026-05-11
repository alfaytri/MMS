// src/hooks/useQuotations.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationListItem, QuotationsFilter } from '@/types/quotations'

export interface QuotationCounts {
  all: number
  draft: number
  sent: number
}

export function useQuotations(filter: QuotationsFilter = {}) {
  const supabase = createClient()

  return useQuery<QuotationListItem[]>({
    queryKey: ['quotations', filter],
    queryFn: async () => {
      let q = supabase
        .from('quotations')
        .select(`
          id, quotation_id, division, status, total_amount, created_date,
          customers(name, customer_phones(phone))
        `)
        .order('created_at', { ascending: false })

      if (filter.statuses?.length) q = q.in('status', filter.statuses)
      if (filter.division)         q = q.eq('division', filter.division)
      if (filter.dateFrom)         q = q.gte('created_date', filter.dateFrom)
      if (filter.dateTo)           q = q.lte('created_date', filter.dateTo)
      if (filter.quotationNumber)  q = q.ilike('quotation_id', `%${filter.quotationNumber}%`)
      // NOTE: filter.customerPhone requires a cross-table filter not supported by
      // PostgREST nested-table syntax — apply client-side after fetch if needed.

      const { data, error } = await q
      if (error) throw error

      let rows = data ?? []
      if (filter.customerPhone) {
        const ph = filter.customerPhone.replace(/\s+/g, '').toLowerCase()
        rows = rows.filter((r: any) =>
          (r.customers?.customer_phones ?? []).some((cp: any) =>
            (cp.phone ?? '').replace(/\s+/g, '').toLowerCase().includes(ph)
          )
        )
      }

      return rows.map((r: any) => ({
        id:             r.id,
        quotation_id:   r.quotation_id,
        customer_name:  r.customers?.name ?? '—',
        customer_phone: r.customers?.customer_phones?.[0]?.phone ?? '—',
        division:       r.division ?? '—',
        status:         r.status,
        total_amount:   r.total_amount ?? 0,
        created_date:   r.created_date ?? '',
      })) as QuotationListItem[]
    },
  })
}

export function useQuotationCounts() {
  const supabase = createClient()

  return useQuery<QuotationCounts>({
    queryKey: ['quotation-counts'],
    queryFn: async () => {
      const [all, draft, sent] = await Promise.all([
        supabase.from('quotations').select('id', { count: 'exact', head: true }),
        supabase
          .from('quotations')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'draft'),
        supabase
          .from('quotations')
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

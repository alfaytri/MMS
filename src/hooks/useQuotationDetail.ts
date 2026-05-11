// src/hooks/useQuotationDetail.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationDetail } from '@/types/quotations'

export function useQuotationDetail(quotationId: string | null) {
  const supabase = createClient()

  return useQuery<QuotationDetail>({
    queryKey: ['quotation-detail', quotationId],
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotations')
        .select(`
          id, quotation_id, customer_id, division, status,
          total_amount, notes, created_date, expiry_date, sent_date,
          customers(name, customer_phones(phone)),
          quotation_line_items(id, service_id, name, path, qty, price, duration),
          quotation_log(id, action, user_name, details, created_at)
        `)
        .eq('id', quotationId!)
        .single()

      if (error) throw error

      const d = data as any
      return {
        id:             d.id,
        quotation_id:   d.quotation_id,
        customer_id:    d.customer_id,
        customer_name:  d.customers?.name ?? '—',
        customer_phone: d.customers?.customer_phones?.[0]?.phone ?? '—',
        division:       d.division ?? '',
        status:         d.status,
        total_amount:   d.total_amount ?? 0,
        notes:          d.notes ?? null,
        created_date:   d.created_date ?? '',
        expiry_date:    d.expiry_date ?? null,
        sent_date:      d.sent_date ?? null,
        line_items: (d.quotation_line_items ?? []).map((li: any) => ({
          id:         li.id,
          service_id: li.service_id,
          name:       li.name,
          path:       li.path ?? [],
          qty:        li.qty,
          price:      li.price,
          duration:   li.duration ?? null,
        })),
        logs: (d.quotation_log ?? []).map((l: any) => ({
          id:         l.id,
          action:     l.action,
          user_name:  l.user_name ?? 'System',
          details:    l.details ?? null,
          created_at: l.created_at,
        })),
      } as QuotationDetail
    },
  })
}

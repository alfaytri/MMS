// src/hooks/useQuotationDetail.ts
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { QuotationDetail } from '@/types/quotations'
import { queryKeys } from '@/lib/queryKeys'

export function useQuotationDetail(quotationId: string | null) {
  const supabase = createClient()

  return useQuery<QuotationDetail>({
    queryKey: queryKeys.quotations.detail(quotationId),
    enabled: !!quotationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_quotations')
        .select(`
          id, quotation_id, service_customer_id, division, status,
          total_amount, notes, created_date, expiry_date, sent_date,
          service_customers(name, service_customer_phones(phone)),
          order_quotation_line_items(id, service_id, name, path, qty, price, duration),
          order_quotation_log(id, action, user_name, details, created_at)
        `)
        .eq('id', quotationId!)
        .single()

      if (error) throw error

      type D = typeof data & {
        service_customers: { name?: string; service_customer_phones?: { phone: string }[] } | null
        order_quotation_line_items: { id: string; service_id: string | null; name: string; path: string[] | null; qty: number; price: number; duration: number | null }[]
        order_quotation_log: { id: string; action: string; user_name: string | null; details: string | null; created_at: string }[]
      }
      const d = data as D
      return {
        id:             d.id,
        quotation_id:   d.quotation_id,
        customer_id:    d.service_customer_id,
        customer_name:  d.service_customers?.name ?? '—',
        customer_phone: d.service_customers?.service_customer_phones?.[0]?.phone ?? '—',
        division:       d.division ?? '',
        status:         d.status,
        total_amount:   d.total_amount ?? 0,
        notes:          d.notes ?? null,
        created_date:   d.created_date ?? '',
        expiry_date:    d.expiry_date ?? null,
        sent_date:      d.sent_date ?? null,
        line_items: (d.order_quotation_line_items ?? []).map((li) => ({
          id:         li.id,
          service_id: li.service_id,
          name:       li.name,
          path:       li.path ?? [],
          qty:        li.qty,
          price:      li.price,
          duration:   li.duration ?? null,
        })),
        logs: (d.order_quotation_log ?? []).map((l) => ({
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

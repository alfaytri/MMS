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

      return {
        id:             data.id,
        quotation_id:   (data as any).quotation_id,
        customer_id:    (data as any).customer_id,
        customer_name:  (data as any).customers?.name ?? '—',
        customer_phone: (data as any).customers?.customer_phones?.[0]?.phone ?? '—',
        division:       (data as any).division ?? '',
        status:         (data as any).status,
        total_amount:   (data as any).total_amount ?? 0,
        notes:          (data as any).notes ?? null,
        created_date:   (data as any).created_date ?? '',
        expiry_date:    (data as any).expiry_date ?? null,
        sent_date:      (data as any).sent_date ?? null,
        line_items: ((data as any).quotation_line_items ?? []).map((li: any) => ({
          id:         li.id,
          service_id: li.service_id ?? null,
          name:       li.name,
          path:       li.path ?? [],
          qty:        li.qty,
          price:      li.price,
          duration:   li.duration ?? null,
        })),
        // quotation_log.user_name is a plain TEXT column (no user_id FK in schema).
        logs: ((data as any).quotation_log ?? []).map((l: any) => ({
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

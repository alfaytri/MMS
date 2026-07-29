import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type DocumentType = 'po' | 'so'

export type ExchangeRateChange = {
  id: string
  old_rate: number
  new_rate: number
  reason: string
  changed_at: string
  changed_by: string | null
  changer_name: string | null
}

export function useExchangeRateChangeLog(
  documentType: DocumentType | null,
  documentId: string | null,
) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['exchange-rate-log', documentType, documentId],
    enabled: !!documentType && !!documentId,
    queryFn: async (): Promise<ExchangeRateChange[]> => {
      const { data, error } = await supabase
        .from('exchange_rate_change_log')
        .select('id, old_rate, new_rate, reason, changed_at, changed_by, user_data(full_name)')
        .eq('document_type', documentType!)
        .eq('document_id', documentId!)
        .order('changed_at', { ascending: false })
        .limit(20)
      if (error) throw error
      type Row = {
        id: string
        old_rate: number | string
        new_rate: number | string
        reason: string
        changed_at: string
        changed_by: string | null
        user_data: { full_name: string | null } | null
      }
      return ((data ?? []) as unknown as Row[]).map((r) => ({
        id: r.id,
        old_rate: Number(r.old_rate),
        new_rate: Number(r.new_rate),
        reason: r.reason,
        changed_at: r.changed_at,
        changed_by: r.changed_by,
        changer_name: r.user_data?.full_name ?? null,
      }))
    },
  })
}

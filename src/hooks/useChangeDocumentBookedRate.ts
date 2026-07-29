import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { DocumentType } from './useExchangeRateChangeLog'

export function useChangeDocumentBookedRate() {
  const supabase = createClient()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      documentType: DocumentType
      documentId: string
      newRate: number
      reason: string
    }) => {
      const { error } = await supabase.rpc('rpc_update_document_initial_rate', {
        p_document_type: args.documentType,
        p_document_id: args.documentId,
        p_new_rate: args.newRate,
        p_reason: args.reason,
      })
      if (error) throw error
    },
    onSuccess: (_data, args) => {
      const parentKey = args.documentType === 'po' ? 'purchase-orders' : 'sale-orders'
      qc.invalidateQueries({ queryKey: [parentKey] })
      qc.invalidateQueries({ queryKey: [parentKey, args.documentId] })
      qc.invalidateQueries({ queryKey: ['payments'] })
      qc.invalidateQueries({ queryKey: ['exchange-rate-log', args.documentType, args.documentId] })
      qc.invalidateQueries({ queryKey: ['document-exchange-summary', args.documentType, args.documentId] })
      toast.success('Booked exchange rate updated')
    },
    onError: (err: any) => toast.error(err?.message ?? 'Failed to update rate'),
  })
}

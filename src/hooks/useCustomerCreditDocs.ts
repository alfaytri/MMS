'use client'

/**
 * Credit documents attached to a customer — CR, Establishment ID, Signed
 * Credit Form. Data lives in `customer_credit_docs` (one row per doc_type).
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditDocType = 'cr' | 'establishment_id' | 'signed_credit_form'

export interface CustomerCreditDoc {
  id:          string
  customer_id: string
  doc_type:    CreditDocType
  file_url:    string
}

export function useCustomerCreditDocs(customerId: string | null | undefined) {
  return useQuery<CustomerCreditDoc[]>({
    queryKey: ['customer-credit-docs', customerId ?? null],
    enabled:  !!customerId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_credit_docs')
        .select('id, customer_id, doc_type, file_url')
        .eq('customer_id', customerId!)
      if (error) throw error
      return (data ?? []) as CustomerCreditDoc[]
    },
    staleTime: 30 * 1000,
  })
}

export interface SaveCreditDocsPayload {
  customer_id: string
  docs: { doc_type: CreditDocType; file_url: string | null }[]
}

export function useSaveCustomerCreditDocs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SaveCreditDocsPayload) => {
      const supabase = createClient()
      // Server-side atomic replace — deletes any doc_type not present in
      // the payload, upserts the rest.
      const cleanDocs = payload.docs
        .filter((d) => d.file_url && d.file_url.trim() !== '')
        .map((d) => ({ doc_type: d.doc_type, file_url: d.file_url }))
      const { error } = await supabase.rpc('save_customer_credit_docs', {
        p_customer_id: payload.customer_id,
        p_docs:        cleanDocs as unknown as string,
      })
      if (error) throw new Error(`${error.code ?? ''} ${error.message}${error.details ? ' — ' + error.details : ''}`.trim())
    },
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['customer-credit-docs', vars.customer_id] })
    },
  })
}

'use client'

/**
 * Credit documents attached to a customer — CR, Establishment ID, Signed
 * Credit Form. Wide-format: one row per customer, three URL columns.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type CreditDocType = 'cr' | 'establishment_id' | 'signed_credit_form'

export interface CustomerCreditDocs {
  customer_id:            string
  cr_url:                 string | null
  establishment_id_url:   string | null
  signed_credit_form_url: string | null
}

export function useCustomerCreditDocs(customerId: string | null | undefined) {
  return useQuery<CustomerCreditDocs | null>({
    queryKey: ['customer-credit-docs', customerId ?? null],
    enabled:  !!customerId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('customer_credit_docs')
        .select('customer_id, cr_url, establishment_id_url, signed_credit_form_url')
        .eq('customer_id', customerId!)
        .maybeSingle()
      if (error) throw error
      return (data as CustomerCreditDocs | null) ?? null
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

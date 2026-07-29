import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DocumentType } from './useExchangeRateChangeLog'

export type ExchangePaymentRow = {
  id: string
  date: string
  amount: number
  exchange_rate: number
  amount_qar: number | null
  exchange_gain: number
  exchange_loss: number
  payment_id: string | null
  method: string
}

export type ExchangeSummary = {
  currency: string
  initialRate: number
  capturedAt: string | null
  totalForeign: number
  bookedQar: number
  paidForeign: number
  paidQar: number
  outstandingForeign: number
  exchangeGain: number
  exchangeLoss: number
  exchangeNet: number
  payments: ExchangePaymentRow[]
}

// payments.source_type is a Postgres enum ('sale_order' | 'purchase_order' | …)
// while our document-facing API uses 'po' | 'so'. Map at the boundary.
function toSourceType(documentType: DocumentType): 'purchase_order' | 'sale_order' {
  return documentType === 'po' ? 'purchase_order' : 'sale_order'
}

export function useDocumentExchangeSummary(
  documentType: DocumentType | null,
  documentId: string | null,
) {
  const supabase = createClient()
  return useQuery({
    queryKey: ['document-exchange-summary', documentType, documentId],
    enabled: !!documentType && !!documentId,
    queryFn: async (): Promise<ExchangeSummary | null> => {
      if (!documentType || !documentId) return null
      const parentTable = documentType === 'po' ? 'purchase_orders' : 'sale_orders'

      type ParentRow = {
        currency: string
        initial_exchange_rate: number | null
        initial_rate_captured_at: string | null
        exchange_gain: number | null
        exchange_loss: number | null
        exchange_net: number | null
        total_qar: number | null
        subtotal: number | null
      }
      type PaymentRow = {
        id: string
        date: string
        amount: number
        exchange_rate: number
        amount_qar: number | null
        exchange_gain: number
        exchange_loss: number
        payment_id: string | null
        method: string
      }

      const { data: parentData, error: parentErr } = await supabase
        .from(parentTable)
        .select('id, currency, initial_exchange_rate, initial_rate_captured_at, exchange_gain, exchange_loss, exchange_net, total_qar, subtotal')
        .eq('id', documentId)
        .single()
      if (parentErr) throw parentErr
      const parent = parentData as unknown as ParentRow

      const { data: paysData, error: paysErr } = await supabase
        .from('payments')
        .select('id, date, amount, exchange_rate, amount_qar, exchange_gain, exchange_loss, payment_id, method')
        .eq('source_type', toSourceType(documentType))
        .eq('source_id', documentId)
        .is('deleted_at', null)
        .order('date', { ascending: true })
      if (paysErr) throw paysErr
      const pays = (paysData ?? []) as unknown as PaymentRow[]

      const totalForeign = Number(parent.subtotal ?? 0)
      const initialRate = Number(parent.initial_exchange_rate ?? 1)
      const bookedQar = Number(parent.total_qar ?? totalForeign * initialRate)
      const paidForeign = pays.reduce((s, p) => s + Number(p.amount), 0)
      const paidQar = pays.reduce((s, p) => s + Number(p.amount_qar ?? 0), 0)

      return {
        currency: parent.currency,
        initialRate,
        capturedAt: parent.initial_rate_captured_at,
        totalForeign,
        bookedQar,
        paidForeign,
        paidQar,
        outstandingForeign: totalForeign - paidForeign,
        exchangeGain: Number(parent.exchange_gain ?? 0),
        exchangeLoss: Number(parent.exchange_loss ?? 0),
        exchangeNet: Number(parent.exchange_net ?? 0),
        payments: pays as ExchangePaymentRow[],
      }
    },
  })
}

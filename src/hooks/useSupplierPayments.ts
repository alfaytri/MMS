import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'
import { logPOActivity } from '@/lib/poActivityLogger'

export type UnlinkedPayment = {
  id: string
  payment_id: string | null
  amount: number
  method: string
  date: string
}

export function useUnlinkedOutgoingPayments(supplierId: string | null | undefined) {
  return useQuery({
    queryKey: queryKeys.supplierPayments.unlinkedOutgoing(supplierId),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('payments')
        .select('id, payment_id, amount, method, date')
        .eq('direction', 'outgoing')
        .is('invoice_id', null)
        .order('date', { ascending: false })
      if (supplierId) q = q.eq('supplier_id', supplierId)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as UnlinkedPayment[]
    },
  })
}

// ─── Edit / Delete (AP corrections) ──────────────────────────────────────────
// Both hooks call SECURITY DEFINER RPCs that enforce purchase.payments.manage
// server-side. The existing bill_recompute_paid_trg trigger fires on payment
// UPDATE/DELETE and restores/recalculates the affected bill's paid_amount +
// payment_status. See migration 20260817000000.

export type EditSupplierPaymentInput = {
  payment_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  exchange_rate?: number | null
  /** Optional context for cache invalidation — no functional effect on the RPC. */
  bill_id?: string | null
  po_id?: string | null
}

export function useEditSupplierPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EditSupplierPaymentInput) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_edit_supplier_payment', {
        p_payment_id:    input.payment_id,
        p_amount:        input.amount,
        p_method:        input.method,
        p_date:          input.date,
        p_reference:     input.reference ?? '',
        p_notes:         input.notes ?? '',
        p_exchange_rate: input.exchange_rate ?? undefined,
      })
      if (error) {
        throw new Error(
          `Edit payment failed: ${error.code} ${error.message}` +
          `${error.details ? ' — ' + error.details : ''}` +
          `${error.hint ? ' (' + error.hint + ')' : ''}`,
        )
      }

      const details =
        `Amount → ${input.amount.toLocaleString('en-QA', { minimumFractionDigits: 2 })}` +
        ` · ${input.method.replace(/_/g, ' ')} · ${input.date}` +
        `${input.reference ? ` · Ref: ${input.reference}` : ''}`
      if (input.po_id) {
        void logPOActivity({ poId: input.po_id, action: 'Payment Edited', details, severity: 'warning' })
      } else {
        void logActivity({
          action: 'Payment Edited',
          module: 'bills',
          entity_id: input.bill_id ?? input.payment_id,
          entity_type: input.bill_id ? 'bill' : 'payment',
          details,
          severity: 'warning',
        })
      }
      return data
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.supplierPayments.all })
      qc.invalidateQueries({ queryKey: queryKeys.supplierBills.all })
      if (input.bill_id) {
        qc.invalidateQueries({ queryKey: queryKeys.supplierBills.detail(input.bill_id) })
        qc.invalidateQueries({ queryKey: queryKeys.supplierBills.viewModelById(input.bill_id) })
      }
      if (input.po_id) {
        qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(input.po_id) })
        qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.payments(input.po_id) })
      }
      // Installment-linked payments ripple into the bill's payment plan
      // (prefix-match invalidates every ['payment-plans', parentId] query).
      qc.invalidateQueries({ queryKey: ['payment-plans'] })
    },
  })
}

export type DeleteSupplierPaymentInput = {
  payment_id: string
  bill_id?: string | null
  po_id?: string | null
  /** Display context for the activity log entry. */
  amount?: number
  currency?: string
}

export function useDeleteSupplierPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: DeleteSupplierPaymentInput) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_delete_supplier_payment', {
        p_payment_id: input.payment_id,
      })
      if (error) {
        throw new Error(
          `Delete payment failed: ${error.code} ${error.message}` +
          `${error.details ? ' — ' + error.details : ''}` +
          `${error.hint ? ' (' + error.hint + ')' : ''}`,
        )
      }

      const details = input.amount != null
        ? `${input.currency ?? 'QAR'} ${input.amount.toLocaleString('en-QA', { minimumFractionDigits: 2 })} removed — balance restored`
        : 'Payment removed — balance restored'
      if (input.po_id) {
        void logPOActivity({ poId: input.po_id, action: 'Payment Deleted', details, severity: 'warning' })
      } else {
        void logActivity({
          action: 'Payment Deleted',
          module: 'bills',
          entity_id: input.bill_id ?? input.payment_id,
          entity_type: input.bill_id ? 'bill' : 'payment',
          details,
          severity: 'warning',
        })
      }
      return data
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.supplierPayments.all })
      qc.invalidateQueries({ queryKey: queryKeys.supplierBills.all })
      if (input.bill_id) {
        qc.invalidateQueries({ queryKey: queryKeys.supplierBills.detail(input.bill_id) })
        qc.invalidateQueries({ queryKey: queryKeys.supplierBills.viewModelById(input.bill_id) })
      }
      if (input.po_id) {
        qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.detail(input.po_id) })
        qc.invalidateQueries({ queryKey: queryKeys.purchaseOrders.payments(input.po_id) })
      }
      qc.invalidateQueries({ queryKey: ['payment-plans'] })
    },
  })
}

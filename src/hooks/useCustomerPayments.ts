// src/hooks/useCustomerPayments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import { notifyOwnerAndKey } from '@/lib/notify'
import { logActivity } from '@/lib/logActivity'
import { humanizeDbError } from '@/lib/dbErrors'

// Re-exported helper used by the payment dialog; splits a total redemption
// amount across the customer's open CNs in FIFO order and returns one
// payment record per CN consumed.
export type StoreCreditRedemption = {
  credit_note_id: string
  amount:         number
}

export type CustomerPayment = {
  id: string
  payment_id: string | null
  invoice_id: string | null
  customer_id: string | null
  source_type: string | null
  source_id: string | null
  amount: number
  amount_qar: number | null
  method: string
  date: string
  reference: string | null
  notes: string | null
  direction: 'incoming'
  status: string | null
  currency: string
  exchange_rate: number
  credit_note_id: string | null
  created_at: string | null
  // joined / resolved
  invoice_display?: string | null
  customer_name?: string | null
  so_number?: string | null
}

export function useCustomerPayments(invoiceId?: string) {
  return useQuery({
    queryKey: queryKeys.customerPayments.byInvoice(invoiceId),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('payments')
        .select('*, customer_id, so_invoices!payments_invoice_id_fkey(invoice_id, customers(name))')
        .eq('direction', 'incoming')
        .order('date', { ascending: false })
      if (invoiceId) q = q.eq('invoice_id', invoiceId)
      const { data, error } = await q
      if (error) throw error

      // Batch-fetch SO details for payments linked to a sale_order
      const soIds: string[] = (data ?? [])
        .filter((p) => p.source_type === 'sale_order' && p.source_id)
        .map((p) => p.source_id as string)

      const soMap: Record<string, { so_number: string; customer_name: string | null }> = {}
      if (soIds.length > 0) {
        const { data: sos } = await supabase
          .from('sale_orders')
          .select('id, so_number, customers(name)')
          .in('id', soIds)
        for (const so of sos ?? []) {
          soMap[so.id] = {
            so_number: so.so_number,
            customer_name: so.customers?.name ?? null,
          }
        }
      }

      return (data ?? []).map((p) => {
        const soInfo = p.source_type === 'sale_order' && p.source_id ? soMap[p.source_id] : null
        return {
          ...p,
          invoice_display: p.so_invoices?.invoice_id ?? null,
          customer_name: p.so_invoices?.customers?.name ?? soInfo?.customer_name ?? null,
          so_number: soInfo?.so_number ?? null,
        }
      }) as CustomerPayment[]
    },
  })
}

export function useCreateCustomerPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      invoice_id: string
      customer_id: string
      amount: number
      method: string
      date: string
      reference: string | null
      notes: string | null
      currency?: string
      exchange_rate?: number
    }) => {
      const supabase = createClient()
      const { data: maxRow } = await supabase
        .from('payments')
        .select('payment_id')
        .ilike('payment_id', 'CPAY-%')
        .order('payment_id', { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastNum = maxRow?.payment_id
        ? parseInt(maxRow.payment_id.replace('CPAY-', ''), 10)
        : 0
      const payment_id = `CPAY-${String(lastNum + 1).padStart(5, '0')}`

      const currency = payload.currency ?? 'QAR'
      const exchangeRate = payload.exchange_rate ?? 1

      // credit_note_id is intentionally not part of this hook — CN
      // redemptions go through rpc_redeem_credit_note via
      // useApplyCreditNote / useApplyStoreCredit. Direct INSERT with
      // credit_note_id is blocked by the payments_no_direct_cn_insert
      // RLS policy.
      const insertRow = {
        payment_id,
        invoice_id:  payload.invoice_id,
        customer_id: payload.customer_id,
        amount:      payload.amount,
        method:      payload.method,
        date:        payload.date,
        reference:   payload.reference,
        notes:       payload.notes,
        direction:   'incoming',
        status:      'completed',
        currency,
        exchange_rate: exchangeRate,
        amount_qar:  payload.amount * exchangeRate,
      }
      const { data, error } = await supabase
        .from('payments')
        .insert(insertRow as unknown as import('@/types/database.types').DBInsert<'payments'>)
        .select()
        .single()
      if (error) throw new Error(humanizeDbError(error, 'record payments'))

      // H14: the client-side recompute has been removed. The DB trigger
      // (_recompute_ar_invoice_payment_status_fn on payments) is the sole
      // authority. The old client path had three gaps: it counted soft-
      // deleted payments (no deleted_at filter), swallowed the .error on
      // the fetch (so an RLS block silently reset totalPaid = 0), and used
      // `?? Infinity` on a failed invoice fetch — downgrading a correct
      // 'paid' invoice back to 'partially_paid'.
      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerPayments.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerPayments.byInvoice(variables.invoice_id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      // Notify the SO owner: payment received, and (if it cleared the balance)
      // the invoice is now fully paid. Best-effort. The DB trigger recomputes
      // payment_status before we read it back here.
      void (async () => {
        const supabase = createClient()
        const { data: inv } = await supabase
          .from('so_invoices')
          .select('invoice_id, sale_order_id, payment_status')
          .eq('id', variables.invoice_id)
          .maybeSingle()
        if (!inv?.sale_order_id) return
        const { data: so } = await supabase
          .from('sale_orders').select('created_by').eq('id', inv.sale_order_id).maybeSingle()
        const owner = so?.created_by ?? null
        await notifyOwnerAndKey(
          owner, 'notify.finance.customer_payment', 'customer_payment_received',
          `Payment received on invoice ${inv.invoice_id}`,
          { relatedId: inv.sale_order_id, relatedType: 'sale_order' },
        )
        if (inv.payment_status === 'paid') {
          await notifyOwnerAndKey(
            owner, 'notify.finance.invoice_paid', 'invoice_paid',
            `Invoice ${inv.invoice_id} is fully paid`,
            { relatedId: inv.sale_order_id, relatedType: 'sale_order' },
          )
        }
      })()
    },
  })
}

/**
 * Redeem store credit against an invoice. Consumes the customer's open credit
 * notes FIFO — one payment record per CN consumed, method='store_credit',
 * credit_note_id linked. Recomputes invoice payment_status once at the end.
 * Returns the number of payments actually created (may be < requested if the
 * customer doesn't have enough credit).
 */
export function useApplyStoreCredit() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: {
      // Either invoice_id OR (source_type='sale_order' + source_id) must be provided.
      invoice_id?:     string | null
      source_type?:    'sale_order' | null
      source_id?:      string | null
      customer_id:     string
      redemptions:     StoreCreditRedemption[]   // [{credit_note_id, amount}]
      date:            string
      reference?:      string | null
      notes?:          string | null
      currency?:       string
      exchange_rate?:  number
    }) => {
      const supabase = createClient()

      // Every redemption goes through rpc_redeem_credit_note. The RPC
      // enforces (a) CN customer match, (b) CN remaining balance under a
      // FOR UPDATE lock, (c) invoice-outstanding cap when invoice-linked,
      // (d) status recompute. Direct INSERT into payments with
      // credit_note_id set is blocked by the payments_no_direct_cn_insert
      // restrictive RLS policy — this hook has no fallback.
      let created = 0
      for (const r of payload.redemptions) {
        if (r.amount <= 0) continue
        const rpcArgs = {
          p_invoice_id:     payload.invoice_id ?? null,
          p_credit_note_id: r.credit_note_id,
          p_amount:         r.amount,
          p_method:         'store_credit',
          p_reference:      payload.reference ?? null,
          p_notes:          payload.notes ?? null,
          p_date:           payload.date,
          p_source_type:    payload.source_type ?? null,
          p_source_id:      payload.source_id ?? null,
        } as unknown as Parameters<typeof supabase.rpc<'rpc_redeem_credit_note'>>[1]
        const { error: rpcErr } = await supabase.rpc('rpc_redeem_credit_note', rpcArgs)
        if (rpcErr) {
          throw new Error(
            `Store-credit redemption failed on CN ${r.credit_note_id.slice(0, 8)}: ` +
            `${rpcErr.code} ${rpcErr.message}${rpcErr.details ? ' — ' + rpcErr.details : ''}${rpcErr.hint ? ' (' + rpcErr.hint + ')' : ''}`,
          )
        }
        created++
      }

      return { created }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.customerPayments.all })
      if (variables.invoice_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.customerPayments.byInvoice(variables.invoice_id) })
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      // The per-SO payments query lives under a separate key (['so-payments', soId]) —
      // invalidate it so the payments tab refreshes after a redemption.
      if (variables.source_type === 'sale_order' && variables.source_id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.saleOrders.payments(variables.source_id) })
      }
      queryClient.invalidateQueries({ queryKey: ['customer-credit-balances'] })
      queryClient.invalidateQueries({ queryKey: ['open-credit-notes', variables.customer_id] })
    },
  })
}

// ─── Edit / Delete (AR corrections) ──────────────────────────────────────────
// SECURITY DEFINER RPCs enforce `sales.payments.manage` server-side. The
// existing invoice_recompute_paid_trg trigger fires on payment UPDATE/DELETE
// and restores/recalculates so_invoices.paid_amount + payment_status. The
// sale_order_paid_summary view is compute-on-demand.
//
// Store-credit redemptions (credit_note_id set) are refused by the RPC —
// those flow through rpc_redeem_credit_note and reversing them requires
// unwinding CN balance, which is out of scope for this task.

export type EditCustomerPaymentInput = {
  payment_id: string
  amount: number
  method: string
  date: string
  reference: string | null
  notes: string | null
  exchange_rate?: number | null
  /** Context for cache invalidation + activity log — no functional effect on the RPC. */
  invoice_id?: string | null
  sale_order_id?: string | null
}

export function useEditCustomerPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: EditCustomerPaymentInput) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_edit_customer_payment', {
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
      void logActivity({
        action: 'Payment Edited',
        module: input.sale_order_id ? 'sale_orders' : 'invoices',
        entity_id: input.sale_order_id ?? input.invoice_id ?? input.payment_id,
        entity_type: input.sale_order_id ? 'sale_order' : (input.invoice_id ? 'invoice' : 'payment'),
        details,
        severity: 'warning',
      })
      return data
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.customerPayments.all })
      qc.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      if (input.invoice_id) {
        qc.invalidateQueries({ queryKey: queryKeys.customerPayments.byInvoice(input.invoice_id) })
      }
      if (input.sale_order_id) {
        qc.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(input.sale_order_id) })
        qc.invalidateQueries({ queryKey: queryKeys.saleOrders.payments(input.sale_order_id) })
      }
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      qc.invalidateQueries({ queryKey: ['payment-plans'] })
    },
  })
}

export type DeleteCustomerPaymentInput = {
  payment_id: string
  invoice_id?: string | null
  sale_order_id?: string | null
  /** Display context for the activity log entry. */
  amount?: number
  currency?: string
}

export function useDeleteCustomerPayment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: DeleteCustomerPaymentInput) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('rpc_delete_customer_payment', {
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
        ? `${input.currency ?? 'QAR'} ${input.amount.toLocaleString('en-QA', { minimumFractionDigits: 2 })} removed — invoice balance restored`
        : 'Payment removed — invoice balance restored'
      void logActivity({
        action: 'Payment Deleted',
        module: input.sale_order_id ? 'sale_orders' : 'invoices',
        entity_id: input.sale_order_id ?? input.invoice_id ?? input.payment_id,
        entity_type: input.sale_order_id ? 'sale_order' : (input.invoice_id ? 'invoice' : 'payment'),
        details,
        severity: 'warning',
      })
      return data
    },
    onSuccess: (_data, input) => {
      qc.invalidateQueries({ queryKey: queryKeys.customerPayments.all })
      qc.invalidateQueries({ queryKey: queryKeys.customerInvoices.all })
      if (input.invoice_id) {
        qc.invalidateQueries({ queryKey: queryKeys.customerPayments.byInvoice(input.invoice_id) })
      }
      if (input.sale_order_id) {
        qc.invalidateQueries({ queryKey: queryKeys.saleOrders.detail(input.sale_order_id) })
        qc.invalidateQueries({ queryKey: queryKeys.saleOrders.payments(input.sale_order_id) })
      }
      qc.invalidateQueries({ queryKey: queryKeys.saleOrders.all })
      qc.invalidateQueries({ queryKey: ['payment-plans'] })
    },
  })
}

// src/hooks/usePaymentPlans.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PaymentPlan, PaymentInstallment } from '@/types/invoice'
import { queryKeys } from '@/lib/queryKeys'

export type { PaymentPlan, PaymentInstallment }

type ParentRef = { invoice_id: string } | { bill_id: string }

export function usePaymentPlans(invoiceId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.plans(invoiceId),
    enabled: !!invoiceId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('payment_plans')
        .select('*, payment_installments(*)')
        .eq('invoice_id', invoiceId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PaymentPlan[]
    },
  })
}

export function useBillPaymentPlans(billId: string | null) {
  return useQuery({
    queryKey: queryKeys.payments.plans(billId),
    enabled: !!billId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('payment_plans')
        .select('*, payment_installments(*)')
        .eq('bill_id', billId!)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PaymentPlan[]
    },
  })
}

type CreatePaymentPlanVars = ParentRef & {
  plan_type: 'schedule' | 'adhoc'
  total_amount: number
  installments: { due_date: string | null; amount: number }[]
}

export function useCreatePaymentPlan() {
  const queryClient = useQueryClient()
  return useMutation<PaymentPlan, Error, CreatePaymentPlanVars>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      const parentCols = 'invoice_id' in payload
        ? { invoice_id: payload.invoice_id }
        : { bill_id: payload.bill_id }

      const { data: plan, error } = await supabase
        .from('payment_plans')
        .insert({
          ...parentCols,
          plan_type: payload.plan_type,
          total_amount: payload.total_amount,
          status: 'active',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.installments.length > 0) {
        const { error: iErr } = await supabase
          .from('payment_installments')
          .insert(
            payload.installments.map((inst) => ({
              plan_id: plan.id,
              due_date: inst.due_date,
              amount: inst.amount,
              paid_amount: 0,
              status: 'pending',
            }))
          )
        if (iErr) throw iErr
      }
      return plan as PaymentPlan
    },
    onSuccess: (_: PaymentPlan, vars: CreatePaymentPlanVars) => {
      const parentId = 'invoice_id' in vars ? vars.invoice_id : vars.bill_id
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans(parentId) })
    },
  })
}

type SettleInstallmentVars = ParentRef & {
  installment_id: string
  plan_id: string
  amount_paid: number
  method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer'
  date: string
  reference: string | null
  currency?: string
  exchange_rate?: number
}

export function useSettleInstallment() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, SettleInstallmentVars>({
    mutationFn: async (payload) => {
      const supabase = createClient()

      // rpc_settle_installment handles everything atomically: payment
      // number generation under lock, additive paid_amount update (never
      // overwrite), conditional status (partial vs paid), plan completion
      // recompute. See migration 20260806140000.
      const { error: rpcErr } = await supabase.rpc('rpc_settle_installment', {
        p_installment_id: payload.installment_id,
        p_amount_paid:    payload.amount_paid,
        p_method:         payload.method,
        p_date:           payload.date,
        p_reference:      payload.reference ?? undefined,
        p_currency:       payload.currency ?? 'QAR',
        p_exchange_rate:  payload.exchange_rate ?? 1,
      })
      if (rpcErr) {
        throw new Error(
          `Settle installment failed: ${rpcErr.code} ${rpcErr.message}` +
          `${rpcErr.details ? ' — ' + rpcErr.details : ''}` +
          `${rpcErr.hint ? ' (' + rpcErr.hint + ')' : ''}`,
        )
      }
    },
    onSuccess: (_: void, vars: SettleInstallmentVars) => {
      const parentId = 'invoice_id' in vars ? vars.invoice_id : vars.bill_id
      queryClient.invalidateQueries({ queryKey: queryKeys.payments.plans(parentId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.supplierPayments.all })
      queryClient.invalidateQueries({ queryKey: queryKeys.customerPayments.all })
    },
  })
}

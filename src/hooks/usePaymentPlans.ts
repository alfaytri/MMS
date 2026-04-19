// src/hooks/usePaymentPlans.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { PaymentPlan, PaymentInstallment } from '@/types/invoice'

export type { PaymentPlan, PaymentInstallment }

export function usePaymentPlans(invoiceId: string | null) {
  return useQuery({
    queryKey: ['payment-plans', invoiceId],
    enabled: !!invoiceId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await (supabase as any)
        .from('payment_plans')
        .select('*, payment_installments(*)')
        .eq('invoice_id', invoiceId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PaymentPlan[]
    },
  })
}

type CreatePaymentPlanVars = {
  invoice_id: string
  plan_type: 'schedule' | 'adhoc'
  total_amount: number
  installments: { due_date: string | null; amount: number }[]
}

export function useCreatePaymentPlan() {
  const queryClient = useQueryClient()
  return useMutation<PaymentPlan, Error, CreatePaymentPlanVars>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      const { data: plan, error } = await (supabase as any)
        .from('payment_plans')
        .insert({
          invoice_id: payload.invoice_id,
          plan_type: payload.plan_type,
          total_amount: payload.total_amount,
          status: 'active',
        })
        .select()
        .single()
      if (error) throw error

      if (payload.installments.length > 0) {
        const { error: iErr } = await (supabase as any)
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
    onSuccess: (_: PaymentPlan, vars: CreatePaymentPlanVars) =>
      queryClient.invalidateQueries({ queryKey: ['payment-plans', vars.invoice_id] }),
  })
}

type SettleInstallmentVars = {
  installment_id: string
  plan_id: string
  invoice_id: string
  amount_paid: number
  method: 'bank_transfer' | 'cash' | 'cheque' | 'online_transfer'
  date: string
  reference: string | null
  direction: 'incoming' | 'outgoing'
}

export function useSettleInstallment() {
  const queryClient = useQueryClient()
  return useMutation<void, Error, SettleInstallmentVars>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      const { count } = await (supabase as any)
        .from('payments')
        .select('*', { count: 'exact', head: true })
      const payment_id = `PAY-${String((count ?? 0) + 1).padStart(5, '0')}`

      const { data: payment, error: payErr } = await (supabase as any)
        .from('payments')
        .insert({
          payment_id,
          invoice_id: payload.invoice_id,
          amount: payload.amount_paid,
          method: payload.method,
          date: payload.date,
          reference: payload.reference,
          direction: payload.direction,
          status: 'completed',
        })
        .select()
        .single()
      if (payErr) throw payErr

      await (supabase as any)
        .from('payment_installments')
        .update({
          paid_amount: payload.amount_paid,
          status: 'paid',
          payment_id: payment.id,
        })
        .eq('id', payload.installment_id)

      // Check if plan is fully settled
      const { data: installments } = await (supabase as any)
        .from('payment_installments')
        .select('status')
        .eq('plan_id', payload.plan_id)
      const allPaid = (installments ?? []).every((i: any) => i.status === 'paid')
      if (allPaid) {
        await (supabase as any)
          .from('payment_plans')
          .update({ status: 'completed' })
          .eq('id', payload.plan_id)
      }
    },
    onSuccess: (_: void, vars: SettleInstallmentVars) => {
      queryClient.invalidateQueries({ queryKey: ['payment-plans', vars.invoice_id] })
      queryClient.invalidateQueries({ queryKey: ['supplier-payments'] })
      queryClient.invalidateQueries({ queryKey: ['customer-payments'] })
    },
  })
}

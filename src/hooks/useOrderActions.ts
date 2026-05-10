// src/hooks/useOrderActions.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { OrderStatus } from '@/types/orders'

const VALID_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  tentative:              ['scheduled', 'cancelled'],
  scheduled:              ['confirmed', 'cancelled', 'waitlist', 'pending-confirmation'],
  'pending-confirmation': ['confirmed', 'scheduled', 'cancelled'],
  confirmed:              ['in-progress', 'cancelled', 'scheduled'],
  'in-progress':          ['completed', 'cancelled'],
  completed:              [],
  cancelled:              [],
  waitlist:               ['scheduled', 'cancelled'],
  'pending-approval':     ['confirmed', 'cancelled'],
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function useOrderActions(orderId: string | null) {
  const supabase = createClient()
  const qc = useQueryClient()

  async function invalidate() {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['orders'] }),
      qc.invalidateQueries({ queryKey: ['order-detail', orderId] }),
    ])
  }

  async function logAction(action: string, details: string) {
    const { error } = await supabase.from('order_log').insert({
      order_id: orderId!,
      action,
      user_name: 'agent',
      details,
    })
    if (error) throw error
  }

  const confirmManually = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('orderId is required')
      const { error } = await supabase
        .from('orders')
        .update({ status: 'confirmed', confirmation_status: 'manually_confirmed' })
        .eq('id', orderId!)
      if (error) throw error
      await logAction('manually_confirmed', 'Order confirmed manually by agent')
    },
    onSuccess: invalidate,
  })

  const rollback = useMutation({
    mutationFn: async () => {
      if (!orderId) throw new Error('orderId is required')
      const { error } = await supabase
        .from('orders')
        .update({ status: 'scheduled', confirmation_status: 'not_sent' })
        .eq('id', orderId!)
      if (error) throw error
      await logAction('rollback', 'Confirmation rolled back to scheduled')
    },
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: async ({ reason, notes }: { reason: string; notes?: string }) => {
      if (!orderId) throw new Error('orderId is required')
      const { error } = await supabase
        .from('orders')
        .update({ status: 'cancelled' })
        .eq('id', orderId!)
      if (error) throw error
      await logAction('cancelled', `Reason: ${reason}${notes ? ` | Notes: ${notes}` : ''}`)
    },
    onSuccess: invalidate,
  })

  const updateOrder = useMutation({
    mutationFn: async (payload: {
      scheduledDate: string
      notes: string
      arrivalPhone: string
      assignments: Array<{ id: string; timeSlot: string; duration: string; scheduledDate: string }>
    }) => {
      if (!orderId) throw new Error('orderId is required')
      const { error: orderErr } = await supabase
        .from('orders')
        .update({
          scheduled_date: payload.scheduledDate,
          notes: payload.notes,
          arrival_phone: payload.arrivalPhone || null,
        })
        .eq('id', orderId)
      if (orderErr) throw orderErr

      for (const a of payload.assignments) {
        const { error: aErr } = await supabase
          .from('order_team_assignments')
          .update({
            scheduled_date: a.scheduledDate,
            time_slot: a.timeSlot,
            duration: a.duration,
          })
          .eq('id', a.id)
        if (aErr) throw aErr
      }

      await logAction('edited', `Order updated — date: ${payload.scheduledDate}`)
    },
    onSuccess: invalidate,
  })

  return { confirmManually, rollback, cancel, updateOrder }
}

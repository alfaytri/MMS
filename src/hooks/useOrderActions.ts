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

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['order-detail', orderId] })
  }

  async function logAction(action: string, details: string) {
    await supabase.from('order_log').insert({ order_id: orderId, action, user_name: 'agent', details })
  }

  const confirmManually = useMutation({
    mutationFn: async () => {
      await supabase.from('orders').update({ status: 'confirmed', confirmation_status: 'manually_confirmed' }).eq('id', orderId!)
      await logAction('manually_confirmed', 'Order confirmed manually by agent')
    },
    onSuccess: invalidate,
  })

  const rollback = useMutation({
    mutationFn: async () => {
      await supabase.from('orders').update({ status: 'scheduled', confirmation_status: 'not_sent' }).eq('id', orderId!)
      await logAction('rollback', 'Confirmation rolled back to scheduled')
    },
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: async ({ reason, notes }: { reason: string; notes?: string }) => {
      await supabase.from('orders').update({ status: 'cancelled' }).eq('id', orderId!)
      await logAction('cancelled', `Reason: ${reason}${notes ? ` | Notes: ${notes}` : ''}`)
    },
    onSuccess: invalidate,
  })

  return { confirmManually, rollback, cancel }
}

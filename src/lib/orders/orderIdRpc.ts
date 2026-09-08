export type OrderKind = 'order' | 'follow-up' | 'backwork'

export function orderIdRpcFor(
  kind: OrderKind,
  mode: 'normal' | 'emergency' | 'waitlist',
): 'next_order_id' | 'next_emergency_order_id' | 'next_backwork_order_id' | 'next_follow_up_order_id' {
  if (kind === 'follow-up') return 'next_follow_up_order_id'
  if (kind === 'backwork') return 'next_backwork_order_id'
  if (mode === 'emergency') return 'next_emergency_order_id'
  return 'next_order_id'
}

import type { ConfirmFollowUpBody } from '@/types/follow-ups'

export function buildFollowUpOrderRows(input: {
  orderId: string
  reused_services: ConfirmFollowUpBody['reused_services']
  new_services:    ConfirmFollowUpBody['new_services']
}): {
  total_amount: number
  order_services: Array<{
    order_id: string
    service_id: string | null
    name: string
    path: string[]
    qty: number
    price: number
    duration: number | null
  }>
} {
  const reused = input.reused_services.map((s) => ({
    order_id: input.orderId,
    service_id: null,
    name: s.name,
    path: [],
    qty: s.qty,
    price: 0,
    duration: s.duration,
  }))
  const fresh = input.new_services.map((s) => ({
    order_id: input.orderId,
    service_id: s.service_id,
    name: s.name,
    path: s.path,
    qty: s.qty,
    price: s.price,
    duration: s.duration,
  }))
  const total = input.new_services.reduce((sum, s) => sum + s.price * s.qty, 0)
  return { total_amount: total, order_services: [...reused, ...fresh] }
}

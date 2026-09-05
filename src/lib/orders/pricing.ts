import type { OrderMode } from '@/types/orders'

/**
 * The unit price to bill for a booked service given the order mode.
 *
 * Emergency orders bill the service's `emergency_price` when it defines one
 * (> 0), otherwise fall back to the base `price`. Normal / waitlist orders
 * always bill the base price. Applied at booking time so the office and the
 * customer see the emergency price on the order, and the `order_services.price`
 * snapshot carries the right amount into the Team-Leader invoice unchanged.
 */
export function effectiveUnitPrice(
  svc: { price: number; emergencyPrice?: number | null },
  mode: OrderMode,
): number {
  if (mode === 'emergency' && svc.emergencyPrice != null && svc.emergencyPrice > 0) {
    return svc.emergencyPrice
  }
  return svc.price
}

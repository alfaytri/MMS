/**
 * Round to 2 decimal places — prevents floating-point drift in billing math.
 * e.g. roundMoney(0.1 + 0.2) → 0.3  (not 0.30000000000000004)
 */
export function roundMoney(n: number): number {
  return Number(n.toFixed(2))
}

/**
 * Compute the discount amount from a subtotal.
 * Always returns a non-negative value capped at the subtotal.
 */
export function computeDiscount(
  subtotal: number,
  type: 'flat' | 'percent',
  value: number,
): number {
  if (value <= 0 || subtotal <= 0) return 0
  const raw =
    type === 'flat'
      ? Math.min(value, subtotal)
      : Math.min((subtotal * value) / 100, subtotal)
  return roundMoney(raw)
}

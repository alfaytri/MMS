// Soft-reconciliation helpers for shipment line quantities vs the PO line. Pure.

/** Un-shipped remainder of a PO line = its qty minus what's already shipped (never below 0). */
export function remainingUnshipped(poLineQty: number, alreadyShipped: number): number {
  return Math.max(0, poLineQty - alreadyShipped)
}

/** True when setting this line to newQty would exceed the PO line's remaining (a soft warning — never a hard block). */
export function exceedsRemaining(newQty: number, poLineQty: number, alreadyShippedElsewhere: number): boolean {
  return newQty > poLineQty - alreadyShippedElsewhere
}

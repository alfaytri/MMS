// ─── Sibling reorder helper ────────────────────────────────────────────────
//
// Moving a category/item up or down in the inventory tree used to swap the two
// rows' `sort_order` values. That only works when adjacent rows have DISTINCT
// sort_orders — but after a bulk catalog load every row shares `sort_order = 0`
// (and ties are common in general), so a pairwise swap (0 <-> 0) is a no-op:
// the RPC "succeeds", the tree re-sorts by name, and the row never moves.
//
// This helper instead renumbers the WHOLE sibling group with a dense sequence
// (0..N-1) in the new visual order, so a move always produces a strict, stable
// ordering regardless of the starting values (all-equal, tied, or sparse).

/**
 * Move the sibling at `idx` one step `up`/`down` and return dense
 * `{ id, sort_order }` updates for the entire group in the new order.
 * Returns `[]` when the move would go out of bounds (caller can ignore).
 */
export function reorderSiblings<T extends { id: string }>(
  siblings: readonly T[],
  idx: number,
  direction: 'up' | 'down',
): { id: string; sort_order: number }[] {
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1
  if (idx < 0 || idx >= siblings.length || targetIdx < 0 || targetIdx >= siblings.length) {
    return []
  }
  const next = siblings.slice()
  ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
  return next.map((s, i) => ({ id: s.id, sort_order: i }))
}

// Client-side mirror of the server's inventory delete/archive guard: a branch
// is "empty" only when on-hand + reserved + damaged + incoming are all zero.
// Uses the denormalized variant columns (global, NOT division-scoped) so it
// matches what rpc_delete_/rpc_archive_inventory_* enforce.

type Stockish = {
  stock_level?: number | null
  reserved_qty?: number | null
  damaged_qty?: number | null
  incoming?: number | null
}

export function variantStockUnits(v: Stockish): number {
  return Math.abs(v.stock_level ?? 0)
    + Math.abs(v.reserved_qty ?? 0)
    + Math.abs(v.damaged_qty ?? 0)
    + Math.abs(v.incoming ?? 0)
}

export function totalStockUnits(vs: Stockish[]): number {
  return vs.reduce((sum, v) => sum + variantStockUnits(v), 0)
}

/** Per-child rows for the "still in stock" breakdown, empties filtered out. */
export function stockBreakdown(
  vs: (Stockish & { brand?: string | null; name_en?: string | null })[],
): { label: string; units: number }[] {
  return vs
    .map((v) => ({ label: v.brand ?? v.name_en ?? 'variant', units: variantStockUnits(v) }))
    .filter((b) => b.units > 0)
}

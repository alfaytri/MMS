'use client'

import { createContext, useContext } from 'react'
import type { BrandVariant } from '@/hooks/useInventory'

/**
 * Batched brand-variants (+ RLS-scoped available on-hand) for the bulk-tool rows
 * of one expanded ToolCategoryRow — so each BulkToolItemRow doesn't fire its own
 * variant + stock queries (the Tools-list N+1). Mirrors ItemVariantsContext.
 *
 * `availableByVariant` is the same figure BulkToolItemRow computed per row:
 * Σ over the variant's division pools of max(0, qty − reserved), qty>0 only.
 * Absent from the map ⇒ 0. When the context is null, a row falls back to its own
 * per-item fetch and keeps working unchanged.
 */
export type BulkToolStockBatch = {
  variantsByItem: Map<string, BrandVariant[]>
  availableByVariant: Map<string, number>
}

const BulkToolStockContext = createContext<BulkToolStockBatch | null>(null)

export const BulkToolStockProvider = BulkToolStockContext.Provider

export function useBulkToolStockContext(): BulkToolStockBatch | null {
  return useContext(BulkToolStockContext)
}

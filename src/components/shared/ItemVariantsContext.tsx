'use client'

import { createContext, useContext } from 'react'
import type { BrandVariant } from '@/hooks/useInventory'
import type { ScopedVariantStock } from '@/hooks/useItemVariantDivisionStock'

/**
 * Optional batch of item→brand-variants (+ division-scoped stock), provided by a
 * list container (an expanded CategoryRow) so per-item rows don't each fire their
 * own variant + stock queries — the Inventory-list N+1.
 *
 * Mirrors ItemAttributesContext: a container renders the Provider as soon as the
 * list is shown (with empty maps while the batch query is in flight), so children
 * NEVER fall back to a per-item query. When the context is absent (null) — a
 * non-list caller — consumers fall back to their own per-item fetch and keep
 * working unchanged.
 *
 * `variantsByItem` maps itemId → its variants (same embedded shape
 * useInventoryBrandVariants returns). `scopedStockByVariant` maps
 * brand_variant_id → division-scoped good stock, or is null when no division is
 * selected (children then read each variant's global stock columns).
 */
export type ItemVariantsBatch = {
  variantsByItem: Map<string, BrandVariant[]>
  scopedStockByVariant: Map<string, ScopedVariantStock> | null
}

const ItemVariantsContext = createContext<ItemVariantsBatch | null>(null)

export const ItemVariantsProvider = ItemVariantsContext.Provider

export function useItemVariantsContext(): ItemVariantsBatch | null {
  return useContext(ItemVariantsContext)
}

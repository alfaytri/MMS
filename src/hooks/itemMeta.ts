// src/hooks/itemMeta.ts
// Shared shape + pure helpers for the app-wide item label (tag > category tree,
// item name, brand, origin). Kept framework-free so it can be reused by every
// resolver (variant / sku / tool-unit) and unit-tested.

/** Everything the shared <ItemLabel> needs, resolved once per list. */
export type ItemMeta = {
  /** "Products > AC Unit > Split > Indoor Unit" — tag-prefixed category path. */
  tree: string
  /** Human brand name, or null when absent or "Generic" (suppressed). */
  brand: string | null
  /** Country of origin (country_codes.name), or null when absent. */
  origin: string | null
  /**
   * The item's canonical name (inventory_items.name_en). Optional — only the
   * variant resolver populates it. Callers that render a denormalized name
   * (e.g. po_line_items.item_name) can fall back to this when that column is
   * blank, so a stale/empty snapshot name never renders as an empty cell.
   */
  name?: string | null
}

/**
 * Resolve the brand line. Prefers the joined brands.name, falls back to the
 * denormalized `brand` text column. "Generic" (from either source) is treated
 * as no brand, so it never shows — per the app-wide display rule.
 */
export function displayBrand(
  brandName: string | null | undefined,
  brandText: string | null | undefined,
): string | null {
  const b = (brandName?.trim() || brandText?.trim() || '')
  if (!b || b.toLowerCase() === 'generic') return null
  return b
}

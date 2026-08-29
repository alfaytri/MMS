import { searchRank } from './searchRank'

/** Minimal shape needed to rank an inventory item — structural, so this stays
 *  free of any hook/type import. */
export type MatchableItem = {
  name_en: string
  name_ar?: string | null
  sku?: string | null
  variants: { brand?: string | null; brand_name?: string | null; code?: string | null; origin?: string | null }[]
}

/**
 * Best (lowest) relevance rank for an item across its own name (EN + AR) and
 * every variant's brand / origin / code — matched via the shared searchRank so
 * inventory ranks the same way the warehouse bars do. -1 = no match.
 */
export function rankInventoryItem(q: string, item: MatchableItem, catPath: string): number {
  const cands: number[] = [searchRank(q, { name: item.name_en, sku: item.sku, category: catPath })]
  if (item.name_ar) cands.push(searchRank(q, { name: item.name_ar }))
  for (const v of item.variants) {
    cands.push(
      searchRank(q, {
        name: item.name_en,
        brand: v.brand_name ?? v.brand,
        origin: v.origin,
        sku: v.code ?? item.sku,
        category: catPath,
      }),
    )
  }
  const valid = cands.filter((r) => r >= 0)
  return valid.length ? Math.min(...valid) : -1
}

/** True when the query matches the item on any field (name/brand/origin/code/category). */
export function matchesInventoryItem(q: string, item: MatchableItem, catPath: string): boolean {
  return rankInventoryItem(q, item, catPath) >= 0
}

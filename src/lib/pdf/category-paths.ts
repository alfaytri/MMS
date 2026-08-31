/**
 * Resolves, for a set of brand-variant line ids, the full category breadcrumb
 * (root › … › leaf) and the catalog item name.
 *
 * Chain: inventory_item_brand_variants → inventory_items(category_id, name_en)
 *        → inventory_categories (walk parent_id up to the root).
 *
 * Used by the PO / quotation / invoice / delivery PDFs to print the category
 * tree above each line, and to fall back to the catalog name when a line's
 * own name (e.g. an unfilled "Vendor Item Name") is blank.
 *
 * Mirrors the brand-variant lookup style in `./arabic-names.ts`. Missing keys
 * or null values are simply absent from the returned map — callers treat that
 * as "no category / no catalog name available".
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Breadcrumb separator shown between category levels. */
export const CATEGORY_SEP = ' › '

export interface CategoryLineInfo {
  /** Full path "root › … › leaf", or null when the item has no category. */
  category_path: string | null
  /** inventory_items.name_en — the catalog name, for blank-name fallback. */
  catalog_name: string | null
}

export async function fetchCategoryInfoByBrandVariant(
  client: SupabaseClient,
  brandVariantIds: Array<string | null | undefined>,
): Promise<Map<string, CategoryLineInfo>> {
  const ids = Array.from(new Set(brandVariantIds.filter((x): x is string => !!x)))
  if (ids.length === 0) return new Map()

  // brand_variant → item(category_id, name_en)
  const { data: bvRows, error: bvErr } = await client
    .from('inventory_item_brand_variants')
    .select('id, inventory_items(category_id, name_en)')
    .in('id', ids)
    .limit(ids.length)
  if (bvErr || !bvRows) return new Map()

  type BvRow = {
    id: string
    inventory_items: { category_id: string | null; name_en: string | null } | null
  }
  const bvInfo = new Map<string, { catId: string | null; catalog: string | null }>()
  const leafIds = new Set<string>()
  for (const r of bvRows as unknown as BvRow[]) {
    const item = r.inventory_items
    const catId = item?.category_id ?? null
    bvInfo.set(r.id, { catId, catalog: item?.name_en ?? null })
    if (catId) leafIds.add(catId)
  }

  // No categories to resolve — still return catalog names for the fallback.
  if (leafIds.size === 0) {
    const out = new Map<string, CategoryLineInfo>()
    for (const [bv, v] of bvInfo) out.set(bv, { category_path: null, catalog_name: v.catalog })
    return out
  }

  // The category table is small (hundreds of rows); one fetch is cheaper than
  // walking parents with N round-trips, and lets us memoise per leaf.
  const { data: cats } = await client
    .from('inventory_categories')
    .select('id, name_en, parent_id')
    .limit(20000)
  const catById = new Map<string, { name: string; parent: string | null }>()
  for (const c of (cats ?? []) as Array<{ id: string; name_en: string; parent_id: string | null }>) {
    catById.set(c.id, { name: c.name_en, parent: c.parent_id })
  }

  const pathCache = new Map<string, string>()
  function pathFor(catId: string): string {
    const cached = pathCache.get(catId)
    if (cached !== undefined) return cached
    const names: string[] = []
    const seen = new Set<string>() // cycle guard — a malformed parent chain must not loop
    let cur: string | null = catId
    while (cur && !seen.has(cur) && catById.has(cur)) {
      seen.add(cur)
      const node: { name: string; parent: string | null } = catById.get(cur)!
      names.push(node.name)
      cur = node.parent
    }
    const path = names.reverse().join(CATEGORY_SEP)
    pathCache.set(catId, path)
    return path
  }

  const out = new Map<string, CategoryLineInfo>()
  for (const [bv, v] of bvInfo) {
    out.set(bv, {
      category_path: v.catId ? pathFor(v.catId) || null : null,
      catalog_name: v.catalog,
    })
  }
  return out
}

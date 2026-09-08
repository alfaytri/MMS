import type { SupabaseClient } from '@supabase/supabase-js'

// "Branch" = the company division(s) an inventory item is stocked in, sourced
// from inventory_item_divisions -> company_divisions. receival_items only carry
// a brand_variant_id, so resolving a received line's branches means hopping
// brand_variant -> item -> division names. Shared by the receival Receipt PDF
// (server) and the Receival Detail dialog (client).

/** One brand-variant → its owning item. */
export interface VariantItemRow { id: string; item_id: string }
/** One (item, division-name) pair; an item may repeat — the builder de-dupes. */
export interface ItemDivisionRow { item_id: string; name: string }

/**
 * Combine variant→item and item→division-name rows into a per-brand-variant list
 * of DISTINCT branch names, preserving first-seen order. Pure so it can be unit
 * tested without a database; the fetch wrapper below feeds it query rows.
 */
export function buildVariantBranchMap(
  variantItemRows: VariantItemRow[],
  itemDivisionRows: ItemDivisionRow[],
): Map<string, string[]> {
  const byItem = new Map<string, string[]>()
  for (const row of itemDivisionRows) {
    if (!row.item_id || !row.name) continue
    const list = byItem.get(row.item_id) ?? []
    if (!list.includes(row.name)) list.push(row.name)
    byItem.set(row.item_id, list)
  }
  const byVariant = new Map<string, string[]>()
  for (const v of variantItemRows) {
    if (!v.id || !v.item_id) continue
    byVariant.set(v.id, byItem.get(v.item_id) ?? [])
  }
  return byVariant
}

/**
 * Resolve each brand-variant id to its item's branch (division) names. Two light
 * reads: variant→item, then item→division-name (embedded via the
 * inventory_item_divisions → company_divisions FK). Null/blank ids are dropped;
 * a variant with no division links resolves to an empty list.
 */
export async function fetchVariantBranches(
  supabase: SupabaseClient,
  brandVariantIds: Array<string | null | undefined>,
): Promise<Map<string, string[]>> {
  const ids = Array.from(new Set(brandVariantIds.filter((v): v is string => !!v)))
  if (ids.length === 0) return new Map()

  const { data: variantRows, error: vErr } = await supabase
    .from('inventory_item_brand_variants')
    .select('id, item_id')
    .in('id', ids)
  if (vErr) throw vErr
  const variantItemRows = ((variantRows ?? []) as Array<{ id: string; item_id: string | null }>)
    .filter((r): r is VariantItemRow => !!r.item_id)

  const itemIds = Array.from(new Set(variantItemRows.map((r) => r.item_id)))
  if (itemIds.length === 0) return new Map()

  const { data: divRows, error: dErr } = await supabase
    .from('inventory_item_divisions')
    .select('item_id, company_divisions(name)')
    .in('item_id', itemIds)
  if (dErr) throw dErr
  const itemDivisionRows: ItemDivisionRow[] = ((divRows ?? []) as Array<{
    item_id: string
    company_divisions: { name: string } | { name: string }[] | null
  }>)
    .map((r) => {
      const cd = Array.isArray(r.company_divisions) ? r.company_divisions[0] : r.company_divisions
      return { item_id: r.item_id, name: cd?.name ?? '' }
    })
    .filter((r) => r.name)

  return buildVariantBranchMap(variantItemRows, itemDivisionRows)
}

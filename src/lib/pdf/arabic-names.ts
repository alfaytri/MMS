/**
 * Fetches the Arabic name (inventory_items.name_ar) for a set of items.
 *
 * Two lookup modes:
 *  - fetchArabicNamesByBrandVariant(client, ids) — use when the line has a
 *    brand_variant_id FK (po_line_items, sale_order_lines, receival_items,
 *    sale_delivery_lines). Traverses brand_variant → inventory_item → name_ar.
 *
 *  - fetchArabicNamesByEnglishName(client, names) — use when the line only
 *    has a free-form description (bill_line_items, invoice_line_items).
 *    Case-sensitive exact match on inventory_items.name_en. Best-effort;
 *    returns whatever matches.
 *
 * Both return a Map<key, name_ar>. Missing keys / null name_ar are simply
 * absent from the map — callers should treat that as "no Arabic available".
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function fetchArabicNamesByBrandVariant(
  client: SupabaseClient,
  brandVariantIds: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = Array.from(new Set(brandVariantIds.filter((x): x is string => !!x)))
  if (ids.length === 0) return new Map()

  const { data, error } = await client
    .from('inventory_item_brand_variants')
    .select('id, inventory_items(name_ar)')
    .in('id', ids)
  if (error || !data) return new Map()

  const map = new Map<string, string>()
  for (const row of data as unknown as Array<{ id: string; inventory_items: { name_ar: string | null } | null }>) {
    const ar = row.inventory_items?.name_ar
    if (ar) map.set(row.id, ar)
  }
  return map
}

export async function fetchArabicNamesByEnglishName(
  client: SupabaseClient,
  names: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const list = Array.from(new Set(names.filter((x): x is string => !!x && x.trim() !== '')))
  if (list.length === 0) return new Map()

  const { data, error } = await client
    .from('inventory_items')
    .select('name_en, name_ar')
    .in('name_en', list)
  if (error || !data) return new Map()

  const map = new Map<string, string>()
  for (const row of data as Array<{ name_en: string; name_ar: string | null }>) {
    if (row.name_ar) map.set(row.name_en, row.name_ar)
  }
  return map
}

// ─── Inventory Excel Import — DB pipeline ──────────────────────────────────────
//
// Consumes ValidatedRow[] produced by src/lib/inventory-import.ts (parsing +
// validation are pure/offline) and turns the valid rows into real
// inventory_categories / inventory_items / inventory_brand_variants rows.
//
// Hierarchy: Category Path > Item Name > Brand (variant). Two rows sharing
// Category Path + Item Name but a different Brand are two brand-variants of
// the same item.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { ValidatedRow, ImportType } from '@/lib/inventory-import'
import { getCategoryPathSegments, buildItemKey, buildVariantKey } from '@/lib/inventory-import'
import type { DBInsert } from '@/types/database.types'

// ─── Types ──────────────────────────────────────────────────────────────────

export type ImportResult = {
  categoriesCreated: number
  itemsCreated: number
  variantsCreated: number
  skipped: number
  errors: { row: number; message: string }[]
}

export type ExistingInventoryLookup = {
  categoryPaths: Set<string>
  itemKeys: Set<string>
  variantKeys: Set<string>
}

type CategoryRow = {
  id: string
  name_en: string
  parent_id: string | null
  type: string
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

/** Capitalizes only the first character; leaves the rest of the string untouched. */
function capitalizeFirst(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

/**
 * Walks the parent_id chain for a category and returns its full path in
 * original casing, e.g. "Electrical > Switches". Guards against cycles.
 */
function buildCategoryPath(categoryId: string, catById: Map<string, CategoryRow>): string {
  const segments: string[] = []
  const seen = new Set<string>()
  let current = catById.get(categoryId)
  while (current) {
    if (seen.has(current.id)) break // cycle guard — should never happen, but never trust prod data
    seen.add(current.id)
    segments.unshift(current.name_en)
    current = current.parent_id ? catById.get(current.parent_id) : undefined
  }
  return segments.join(' > ')
}

// ─── useInventoryImport — runs the actual import ───────────────────────────

export function useInventoryImport() {
  const queryClient = useQueryClient()

  return useMutation<ImportResult, Error, ValidatedRow[]>({
    mutationFn: async (rows) => {
      const supabase = createClient()
      const validRows = rows.filter((r) => r.valid)

      const errors: { row: number; message: string }[] = []
      let categoriesCreated = 0
      let itemsCreated = 0
      let variantsCreated = 0
      let skipped = 0

      // ─── Step 1: Load existing categories, build lookups ───────────────
      const { data: existingCategories, error: catFetchErr } = await supabase
        .from('inventory_categories')
        .select('id, name_en, parent_id, type')
      if (catFetchErr) throw catFetchErr

      const catById = new Map<string, CategoryRow>()
      for (const c of (existingCategories ?? []) as CategoryRow[]) {
        catById.set(c.id, c)
      }

      const childrenByParent = new Map<string, CategoryRow[]>()
      for (const c of catById.values()) {
        const key = c.parent_id ?? '__root__'
        if (!childrenByParent.has(key)) childrenByParent.set(key, [])
        childrenByParent.get(key)!.push(c)
      }

      // type-scoped lowercase path -> category id (e.g. "products::electrical > switches")
      const pathToId = new Map<string, string>()
      for (const c of catById.values()) {
        const path = buildCategoryPath(c.id, catById).toLowerCase()
        pathToId.set(`${c.type.toLowerCase()}::${path}`, c.id)
      }

      // ─── Step 2: Resolve/create categories ──────────────────────────────
      // One entry per unique category path (preserve original casing + the
      // row it first appeared on, for error reporting, + its declared type).
      const uniquePaths = new Map<string, { originalPath: string; type: string; firstRow: number }>()
      for (const row of validRows) {
        const key = `${row.type.toLowerCase()}::${row.categoryPath.trim().toLowerCase()}`
        if (!uniquePaths.has(key)) {
          uniquePaths.set(key, { originalPath: row.categoryPath, type: row.type, firstRow: row.rowIndex })
        }
      }

      // type-scoped full path (lowercase) -> leaf category id, used by Step 3
      const resolvedPathToId = new Map<string, string>()

      for (const [fullPathKey, { originalPath, type, firstRow }] of uniquePaths) {
        const segments = originalPath
          .split('>')
          .map((s) => s.trim())
          .filter((s) => s.length > 0)

        let parentId: string | null = null
        let cumulativeLower = ''
        let failed = false
        const typeLower = type.toLowerCase()

        for (const segment of segments) {
          cumulativeLower = cumulativeLower ? `${cumulativeLower} > ${segment.toLowerCase()}` : segment.toLowerCase()
          const typePathKey = `${typeLower}::${cumulativeLower}`

          let catId: string | undefined = pathToId.get(typePathKey)

          if (!catId) {
            // Not seen at this exact path yet — check for a same-named sibling
            // under the same parent (case-insensitive) before creating new.
            const siblings: CategoryRow[] = childrenByParent.get(parentId ?? '__root__') ?? []
            const existing: CategoryRow | undefined = siblings.find(
              (s: CategoryRow) => s.name_en.trim().toLowerCase() === segment.toLowerCase() && s.type.toLowerCase() === typeLower
            )

            if (existing) {
              catId = existing.id
              pathToId.set(typePathKey, catId)
            } else {
              const insertPayload: DBInsert<'inventory_categories'> = {
                name_en: capitalizeFirst(segment),
                type: type as ImportType,
                parent_id: parentId,
                status: 'active',
                sort_order: 0,
              }
              const { data: newCat, error: insErr } = await supabase
                .from('inventory_categories')
                .insert(insertPayload)
                .select('id, name_en, parent_id, type')
                .single()

              if (insErr || !newCat) {
                errors.push({
                  row: firstRow,
                  message: `Failed to create category "${originalPath}": ${insErr?.message ?? 'unknown error'}`,
                })
                failed = true
                break
              }

              catId = newCat.id
              categoriesCreated++

              const newCatRow: CategoryRow = newCat as CategoryRow
              catById.set(newCatRow.id, newCatRow)
              const key = parentId ?? '__root__'
              if (!childrenByParent.has(key)) childrenByParent.set(key, [])
              childrenByParent.get(key)!.push(newCatRow)
              pathToId.set(typePathKey, catId)
            }
          }

          parentId = catId ?? null
        }

        if (!failed && parentId) {
          resolvedPathToId.set(fullPathKey, parentId)
        }
      }

      // ─── Step 3: Resolve/create items ───────────────────────────────────
      const { data: existingItems, error: itemFetchErr } = await supabase
        .from('inventory_items')
        .select('id, name_en, category_id')
      if (itemFetchErr) throw itemFetchErr

      // `${categoryId}||${itemNameLower}` -> item id
      const itemMap = new Map<string, string>()
      for (const it of (existingItems ?? []) as { id: string; name_en: string; category_id: string }[]) {
        itemMap.set(`${it.category_id}||${it.name_en.trim().toLowerCase()}`, it.id)
      }

      // One entry per unique (categoryPath, itemName) combo.
      type ItemGroupInfo = { type: string; categoryPath: string; itemName: string; itemNameAr: string; unit: string; rowIndex: number }
      const itemGroups = new Map<string, ItemGroupInfo>()
      for (const row of validRows) {
        const key = buildItemKey(row.type, row.categoryPath, row.itemName)
        if (!itemGroups.has(key)) {
          itemGroups.set(key, {
            type: row.type,
            categoryPath: row.categoryPath,
            itemName: row.itemName,
            itemNameAr: row.itemNameAr,
            unit: row.unit,
            rowIndex: row.rowIndex,
          })
        }
      }

      // buildItemKey(...) -> resolved item id (only for groups that resolved successfully)
      const resolvedItemId = new Map<string, string>()

      for (const [itemKey, info] of itemGroups) {
        const categoryId = resolvedPathToId.get(`${info.type.toLowerCase()}::${info.categoryPath.trim().toLowerCase()}`)
        if (!categoryId) {
          errors.push({
            row: info.rowIndex,
            message: `Category "${info.categoryPath}" could not be resolved; item "${info.itemName}" was skipped.`,
          })
          continue
        }

        const itemMapKey = `${categoryId}||${info.itemName.trim().toLowerCase()}`
        let itemId = itemMap.get(itemMapKey)

        if (!itemId) {
          const insertPayload: DBInsert<'inventory_items'> = {
            name_en: info.itemName,
            name_ar: info.itemNameAr || null,
            sku: info.itemName,
            unit: info.unit,
            category_id: categoryId,
            status: 'active',
            sort_order: 0,
          }
          const { data: newItem, error: itemErr } = await supabase
            .from('inventory_items')
            .insert(insertPayload)
            .select('id')
            .single()

          if (itemErr || !newItem) {
            errors.push({
              row: info.rowIndex,
              message: `Failed to create item "${info.itemName}": ${itemErr?.message ?? 'unknown error'}`,
            })
            continue
          }

          itemId = newItem.id
          itemsCreated++
          itemMap.set(itemMapKey, itemId)
        }

        resolvedItemId.set(itemKey, itemId)
      }

      // ─── Step 4: Create brand variants ──────────────────────────────────
      const { data: existingVariants, error: variantFetchErr } = await supabase
        .from('inventory_brand_variants')
        .select('id, item_id, brand')
      if (variantFetchErr) throw variantFetchErr

      // `${itemId}||${brandLower}`
      const variantSet = new Set<string>()
      for (const v of (existingVariants ?? []) as { id: string; item_id: string; brand: string }[]) {
        variantSet.add(`${v.item_id}||${v.brand.trim().toLowerCase()}`)
      }

      for (const row of validRows) {
        const itemKey = buildItemKey(row.type, row.categoryPath, row.itemName)
        const itemId = resolvedItemId.get(itemKey)
        if (!itemId) {
          // Category/item resolution already failed and was reported above.
          skipped++
          continue
        }

        const variantMapKey = `${itemId}||${row.brand.trim().toLowerCase()}`
        if (variantSet.has(variantMapKey)) {
          skipped++
          continue
        }

        const insertPayload: DBInsert<'inventory_brand_variants'> = {
          item_id: itemId,
          brand: row.brand,
          cost_price: row.costPrice,
          selling_price: row.sellingPrice,
          average_cost: row.costPrice,
          stock_level: 0,
          status: 'active',
          sort_order: 0,
        }
        const { error: variantErr } = await supabase.from('inventory_brand_variants').insert(insertPayload)

        if (variantErr) {
          errors.push({
            row: row.rowIndex,
            message: `Failed to create brand variant "${row.brand}": ${variantErr.message}`,
          })
          continue
        }

        variantSet.add(variantMapKey)
        variantsCreated++
      }

      return { categoriesCreated, itemsCreated, variantsCreated, skipped, errors }
    },
    onSuccess: () => {
      // Bulk import touches all three inventory tables — invalidate broadly
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.categoriesTree })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.categoriesAllFlat })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.itemsAll })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.itemsAllV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariants })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsGrouped })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.allBrandNames })
    },
  })
}

// ─── useExistingInventoryLookup — data for buildPreview() ──────────────────

/**
 * Fetches existing categories/items/brand-variants and returns them as Sets
 * keyed exactly like buildPreview() (from inventory-import.ts) expects, so
 * the preview diff counts match what useInventoryImport() will actually do.
 *
 * Exposed as a mutation (rather than a query) because it's triggered on
 * demand right before showing the preview, not kept live in the cache.
 */
export function useExistingInventoryLookup() {
  return useMutation<ExistingInventoryLookup, Error, void>({
    mutationFn: async () => {
      const supabase = createClient()

      const { data: categories, error: catErr } = await supabase
        .from('inventory_categories')
        .select('id, name_en, parent_id, type')
      if (catErr) throw catErr

      const catById = new Map<string, CategoryRow>()
      for (const c of (categories ?? []) as CategoryRow[]) {
        catById.set(c.id, c)
      }

      const categoryPaths = new Set<string>()
      for (const c of catById.values()) {
        const path = buildCategoryPath(c.id, catById)
        for (const segment of getCategoryPathSegments(c.type, path)) {
          categoryPaths.add(segment)
        }
      }

      const { data: items, error: itemErr } = await supabase
        .from('inventory_items')
        .select('id, name_en, category_id')
      if (itemErr) throw itemErr

      const itemKeys = new Set<string>()
      const itemInfoById = new Map<string, { type: string; path: string; name_en: string }>()
      for (const it of (items ?? []) as { id: string; name_en: string; category_id: string }[]) {
        const cat = catById.get(it.category_id)
        if (!cat) continue
        const path = buildCategoryPath(it.category_id, catById)
        itemKeys.add(buildItemKey(cat.type, path, it.name_en))
        itemInfoById.set(it.id, { type: cat.type, path, name_en: it.name_en })
      }

      const { data: variants, error: variantErr } = await supabase
        .from('inventory_brand_variants')
        .select('id, item_id, brand')
      if (variantErr) throw variantErr

      const variantKeys = new Set<string>()
      for (const v of (variants ?? []) as { id: string; item_id: string; brand: string }[]) {
        const info = itemInfoById.get(v.item_id)
        if (!info) continue
        variantKeys.add(buildVariantKey(info.type, info.path, info.name_en, v.brand))
      }

      return { categoryPaths, itemKeys, variantKeys }
    },
  })
}

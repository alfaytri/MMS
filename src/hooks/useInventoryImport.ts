// ─── Inventory Excel Import — DB pipeline ──────────────────────────────────────
//
// Consumes ValidatedRow[] produced by src/lib/inventory-import.ts (parsing +
// validation are pure/offline) and turns the valid rows into real
// inventory_categories / inventory_items / inventory_item_brand_variants rows.
//
// Hierarchy: Category Path > Item Name > Brand (variant). Two rows sharing
// Category Path + Item Name but a different Brand are two brand-variants of
// the same item.
//
// Safety: All three inventory tables have unique expression indexes
// (lower(trim(...))) so duplicates are impossible at the DB level. The
// pipeline uses insert + 23505 conflict detection → select fallback, making
// retries completely safe.

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { queryKeys } from '@/lib/queryKeys'
import type { ValidatedRow, ImportType } from '@/lib/inventory-import'
import { getCategoryPathSegments, buildItemKey, buildVariantKey } from '@/lib/inventory-import'
import type { ExistingCategoryOption } from '@/lib/inventory-import'

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
  /** Phase D.14 — powers the "advisory" dropdowns in the template's Category
   *  columns. Each entry is a distinct (depth, type, name, full_path) tuple. */
  existingCategoryOptions: ExistingCategoryOption[]
}

type CategoryRow = {
  id: string
  name_en: string
  parent_id: string | null
  type: string
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function capitalizeFirst(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return trimmed
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

function buildCategoryPath(categoryId: string, catById: Map<string, CategoryRow>): string {
  const segments: string[] = []
  const seen = new Set<string>()
  let current = catById.get(categoryId)
  while (current) {
    if (seen.has(current.id)) break
    seen.add(current.id)
    segments.unshift(current.name_en)
    current = current.parent_id ? catById.get(current.parent_id) : undefined
  }
  return segments.join(' > ')
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  return error?.code === '23505'
}

const BATCH_SIZE = 50

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

      const pathToId = new Map<string, string>()
      for (const c of catById.values()) {
        const path = buildCategoryPath(c.id, catById).toLowerCase()
        pathToId.set(`${c.type.toLowerCase()}::${path}`, c.id)
      }

      // ─── Step 2: Resolve/create categories (sequential — parent→child) ──
      // Phase D.14: rows now carry an already-split `categorySegments: string[]`
      // (variable depth per row). Group by the joined lowercase path per type
      // so we only walk each unique path once, but keep the ORIGINAL segments
      // (case + whitespace preserved) for insert-side capitalization.
      const uniquePaths = new Map<string, { originalSegments: string[]; type: string; firstRow: number }>()
      for (const row of validRows) {
        const joinedLower = row.categorySegments.map((s) => s.trim().toLowerCase()).join(' > ')
        const key = `${row.type.toLowerCase()}::${joinedLower}`
        if (!uniquePaths.has(key)) {
          uniquePaths.set(key, { originalSegments: row.categorySegments, type: row.type, firstRow: row.rowIndex })
        }
      }

      const resolvedPathToId = new Map<string, string>()

      for (const [fullPathKey, { originalSegments, type, firstRow }] of uniquePaths) {
        const segments = originalSegments.map((s) => s.trim()).filter((s) => s.length > 0)

        let parentId: string | null = null
        let cumulativeLower = ''
        let failed = false
        const typeLower = type.toLowerCase()

        for (const segment of segments) {
          cumulativeLower = cumulativeLower ? `${cumulativeLower} > ${segment.toLowerCase()}` : segment.toLowerCase()
          const typePathKey = `${typeLower}::${cumulativeLower}`

          let catId: string | undefined = pathToId.get(typePathKey)

          if (!catId) {
            const siblings: CategoryRow[] = childrenByParent.get(parentId ?? '__root__') ?? []
            const existing: CategoryRow | undefined = siblings.find(
              (s: CategoryRow) => s.name_en.trim().toLowerCase() === segment.toLowerCase() && s.type.toLowerCase() === typeLower
            )

            if (existing) {
              catId = existing.id
              pathToId.set(typePathKey, catId)
            } else {
              const insertResult = await supabase
                .from('inventory_categories')
                .insert({
                  name_en: capitalizeFirst(segment),
                  type: type as ImportType,
                  parent_id: parentId,
                  status: 'active',
                  sort_order: 0,
                })
                .select('id, name_en, parent_id, type')
                .single()
              const newCat = insertResult.data as CategoryRow | null
              const insErr = insertResult.error

              if (insErr) {
                if (isUniqueViolation(insErr)) {
                  // Already exists (race or retry) — find and use it
                  let foundCat: CategoryRow | null = null
                  if (parentId) {
                    const { data } = await supabase
                      .from('inventory_categories')
                      .select('id, name_en, parent_id, type')
                      .ilike('name_en', capitalizeFirst(segment))
                      .eq('type', type as ImportType)
                      .eq('parent_id', parentId)
                      .maybeSingle()
                    foundCat = data as CategoryRow | null
                  } else {
                    const { data } = await supabase
                      .from('inventory_categories')
                      .select('id, name_en, parent_id, type')
                      .ilike('name_en', capitalizeFirst(segment))
                      .eq('type', type as ImportType)
                      .is('parent_id', null)
                      .maybeSingle()
                    foundCat = data as CategoryRow | null
                  }

                  if (foundCat) {
                    catId = foundCat.id
                    const catRow = foundCat as CategoryRow
                    catById.set(catRow.id, catRow)
                    const pKey = parentId ?? '__root__'
                    if (!childrenByParent.has(pKey)) childrenByParent.set(pKey, [])
                    childrenByParent.get(pKey)!.push(catRow)
                    pathToId.set(typePathKey, catId)
                  } else {
                    errors.push({ row: firstRow, message: `Category path conflict but could not find existing row.` })
                    failed = true
                    break
                  }
                } else {
                  errors.push({ row: firstRow, message: `Failed to create category "${segment}": ${insErr.message}` })
                  failed = true
                  break
                }
              } else if (newCat) {
                catId = newCat.id
                categoriesCreated++

                const newCatRow: CategoryRow = newCat as CategoryRow
                catById.set(newCatRow.id, newCatRow)
                const pKey = parentId ?? '__root__'
                if (!childrenByParent.has(pKey)) childrenByParent.set(pKey, [])
                childrenByParent.get(pKey)!.push(newCatRow)
                pathToId.set(typePathKey, catId)
              }
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

      const itemMap = new Map<string, string>()
      for (const it of (existingItems ?? []) as { id: string; name_en: string; category_id: string }[]) {
        itemMap.set(`${it.category_id}||${it.name_en.trim().toLowerCase()}`, it.id)
      }

      type ItemGroupInfo = {
        type: string
        categorySegments: string[]
        itemName: string
        itemNameAr: string
        unit: string
        rowIndex: number
        defaultWarehouseId: string | null
        defaultSubContainerId: string | null
        imageUrl: string | null
      }
      const itemGroups = new Map<string, ItemGroupInfo>()
      for (const row of validRows) {
        const key = buildItemKey(row.type, row.categorySegments, row.itemName)
        if (!itemGroups.has(key)) {
          itemGroups.set(key, {
            type: row.type,
            categorySegments: row.categorySegments,
            itemName: row.itemName,
            itemNameAr: row.itemNameAr,
            unit: row.unit,
            rowIndex: row.rowIndex,
            defaultWarehouseId:    row.subContainer?.warehouse_id ?? null,
            defaultSubContainerId: row.subContainer?.sub_container_id ?? null,
            imageUrl:              row.imageUrl?.trim() ? row.imageUrl.trim() : null,
          })
        }
      }

      const resolvedItemId = new Map<string, string>()

      // Separate already-existing items from pending ones
      type PendingItem = { itemKey: string; info: ItemGroupInfo; categoryId: string }
      const pendingItems: PendingItem[] = []

      for (const [itemKey, info] of itemGroups) {
        const joinedLower = info.categorySegments.map((s) => s.trim().toLowerCase()).join(' > ')
        const categoryId = resolvedPathToId.get(`${info.type.toLowerCase()}::${joinedLower}`)
        if (!categoryId) {
          errors.push({
            row: info.rowIndex,
            message: `Category path could not be resolved; item "${info.itemName}" was skipped.`,
          })
          continue
        }

        const itemMapKey = `${categoryId}||${info.itemName.trim().toLowerCase()}`
        const existingId = itemMap.get(itemMapKey)

        if (existingId) {
          resolvedItemId.set(itemKey, existingId)
        } else {
          pendingItems.push({ itemKey, info, categoryId })
        }
      }

      // Batch insert items — on unique violation, fall back to row-by-row.
      // Phase D.14: stamp default_warehouse_id + default_sub_container_id from
      // the picked composite so downstream receival/delivery dialogs may
      // pre-fill.
      for (let i = 0; i < pendingItems.length; i += BATCH_SIZE) {
        const batch = pendingItems.slice(i, i + BATCH_SIZE)
        const payloads = batch.map((p) => ({
          name_en: p.info.itemName,
          name_ar: p.info.itemNameAr || null,
          sku: p.info.itemName,
          unit: p.info.unit,
          category_id: p.categoryId,
          default_warehouse_id:     p.info.defaultWarehouseId,
          default_sub_container_id: p.info.defaultSubContainerId,
          image_url:                p.info.imageUrl,
          status: 'active' as const,
          sort_order: 0,
        }))

        const { data: inserted, error: batchErr } = await supabase
          .from('inventory_items')
          .insert(payloads)
          .select('id, name_en, category_id')

        if (batchErr) {
          if (isUniqueViolation(batchErr)) {
            // Batch had a conflict — process one-by-one
            for (const p of batch) {
              const mapKey = `${p.categoryId}||${p.info.itemName.trim().toLowerCase()}`
              if (itemMap.has(mapKey)) {
                resolvedItemId.set(p.itemKey, itemMap.get(mapKey)!)
                continue
              }

              const { data: single, error: singleErr } = await supabase
                .from('inventory_items')
                .insert({
                  name_en: p.info.itemName,
                  name_ar: p.info.itemNameAr || null,
                  sku: p.info.itemName,
                  unit: p.info.unit,
                  category_id: p.categoryId,
                  default_warehouse_id:     p.info.defaultWarehouseId,
                  default_sub_container_id: p.info.defaultSubContainerId,
                  image_url:                p.info.imageUrl,
                  status: 'active',
                  sort_order: 0,
                })
                .select('id')
                .single()

              if (singleErr && isUniqueViolation(singleErr)) {
                const { data: found } = await supabase
                  .from('inventory_items')
                  .select('id')
                  .eq('category_id', p.categoryId)
                  .ilike('name_en', p.info.itemName)
                  .maybeSingle()
                if (found) {
                  itemMap.set(mapKey, found.id)
                  resolvedItemId.set(p.itemKey, found.id)
                } else {
                  errors.push({ row: p.info.rowIndex, message: `Item "${p.info.itemName}" conflict but could not find existing row.` })
                }
              } else if (singleErr) {
                errors.push({ row: p.info.rowIndex, message: `Failed to create item "${p.info.itemName}": ${singleErr.message}` })
              } else if (single) {
                itemMap.set(mapKey, single.id)
                resolvedItemId.set(p.itemKey, single.id)
                itemsCreated++
              }
            }
          } else {
            for (const p of batch) {
              errors.push({ row: p.info.rowIndex, message: `Failed to create item "${p.info.itemName}": ${batchErr.message}` })
            }
          }
          continue
        }

        // Batch succeeded — map all returned rows
        for (const row of (inserted ?? []) as { id: string; name_en: string; category_id: string }[]) {
          const mapKey = `${row.category_id}||${row.name_en.trim().toLowerCase()}`
          itemMap.set(mapKey, row.id)
        }
        for (const p of batch) {
          const mapKey = `${p.categoryId}||${p.info.itemName.trim().toLowerCase()}`
          const itemId = itemMap.get(mapKey)
          if (itemId) {
            resolvedItemId.set(p.itemKey, itemId)
            itemsCreated++
          } else {
            errors.push({ row: p.info.rowIndex, message: `Item "${p.info.itemName}" was not returned after insert.` })
          }
        }
      }

      // ─── Step 4: Create brand variants (batched) ────────────────────────
      const { data: existingVariants, error: variantFetchErr } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, item_id, brand')
      if (variantFetchErr) throw variantFetchErr

      const variantSet = new Set<string>()
      for (const v of (existingVariants ?? []) as { id: string; item_id: string; brand: string }[]) {
        variantSet.add(`${v.item_id}||${v.brand.trim().toLowerCase()}`)
      }

      type PendingVariant = { row: ValidatedRow; itemId: string }
      const pendingVariants: PendingVariant[] = []

      for (const row of validRows) {
        const itemKey = buildItemKey(row.type, row.categorySegments, row.itemName)
        const itemId = resolvedItemId.get(itemKey)
        if (!itemId) {
          skipped++
          continue
        }

        const variantMapKey = `${itemId}||${row.brand.trim().toLowerCase()}`
        if (variantSet.has(variantMapKey)) {
          skipped++
          continue
        }

        variantSet.add(variantMapKey)
        pendingVariants.push({ row, itemId })
      }

      // Batch insert variants — on unique violation, fall back to row-by-row
      for (let i = 0; i < pendingVariants.length; i += BATCH_SIZE) {
        const batch = pendingVariants.slice(i, i + BATCH_SIZE)
        const payloads = batch.map((p) => ({
          item_id: p.itemId,
          brand: p.row.brand,
          cost_price: p.row.costPrice,
          selling_price: p.row.sellingPrice,
          average_cost: p.row.costPrice,
          stock_level: 0,
          status: 'active' as const,
          sort_order: 0,
        }))

        const { data: inserted, error: batchErr } = await supabase
          .from('inventory_item_brand_variants')
          .insert(payloads)
          .select('id')

        if (batchErr) {
          if (isUniqueViolation(batchErr)) {
            for (const p of batch) {
              const vKey = `${p.itemId}||${p.row.brand.trim().toLowerCase()}`
              if (variantSet.has(vKey)) {
                skipped++
                continue
              }

              const { error: singleErr } = await supabase
                .from('inventory_item_brand_variants')
                .insert({
                  item_id: p.itemId,
                  brand: p.row.brand,
                  cost_price: p.row.costPrice,
                  selling_price: p.row.sellingPrice,
                  average_cost: p.row.costPrice,
                  stock_level: 0,
                  status: 'active',
                  sort_order: 0,
                })

              if (singleErr && isUniqueViolation(singleErr)) {
                skipped++
              } else if (singleErr) {
                errors.push({ row: p.row.rowIndex, message: `Failed to create variant "${p.row.brand}": ${singleErr.message}` })
              } else {
                variantsCreated++
              }
            }
          } else {
            for (const p of batch) {
              errors.push({ row: p.row.rowIndex, message: `Failed to create variant "${p.row.brand}": ${batchErr.message}` })
            }
          }
          continue
        }

        variantsCreated += (inserted ?? []).length
      }

      return { categoriesCreated, itemsCreated, variantsCreated, skipped, errors }
    },
    onSuccess: () => {
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
      const existingCategoryOptions: ExistingCategoryOption[] = []
      for (const c of catById.values()) {
        const path = buildCategoryPath(c.id, catById)
        const segments = path.split('>').map((s) => s.trim()).filter((s) => s.length > 0)
        for (const segment of getCategoryPathSegments(c.type, segments)) {
          categoryPaths.add(segment)
        }
        // Phase D.14: depth = 1-based level of this leaf's own name in the path.
        existingCategoryOptions.push({
          depth:     segments.length,
          type:      c.type,
          name:      c.name_en,
          full_path: `${c.type}::${path}`,
        })
      }

      const { data: items, error: itemErr } = await supabase
        .from('inventory_items')
        .select('id, name_en, category_id')
      if (itemErr) throw itemErr

      const itemKeys = new Set<string>()
      const itemInfoById = new Map<string, { type: string; segments: string[]; name_en: string }>()
      for (const it of (items ?? []) as { id: string; name_en: string; category_id: string }[]) {
        const cat = catById.get(it.category_id)
        if (!cat) continue
        const path = buildCategoryPath(it.category_id, catById)
        const segments = path.split('>').map((s) => s.trim()).filter((s) => s.length > 0)
        itemKeys.add(buildItemKey(cat.type, segments, it.name_en))
        itemInfoById.set(it.id, { type: cat.type, segments, name_en: it.name_en })
      }

      const { data: variants, error: variantErr } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, item_id, brand')
      if (variantErr) throw variantErr

      const variantKeys = new Set<string>()
      for (const v of (variants ?? []) as { id: string; item_id: string; brand: string }[]) {
        const info = itemInfoById.get(v.item_id)
        if (!info) continue
        variantKeys.add(buildVariantKey(info.type, info.segments, info.name_en, v.brand))
      }

      return { categoryPaths, itemKeys, variantKeys, existingCategoryOptions }
    },
  })
}

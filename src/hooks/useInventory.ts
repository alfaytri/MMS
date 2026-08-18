import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import type { DBTable, DBInsert, DBUpdate } from '@/types/database.types'
import { queryKeys } from '@/lib/queryKeys'
import { logActivity } from '@/lib/logActivity'

export type InventoryCategory = DBTable<'inventory_categories'>
export type InventoryItem = DBTable<'inventory_items'>
export type BrandVariant = DBTable<'inventory_item_brand_variants'>
/**
 * A brand variant as returned by the joined picker/catalog queries
 * (`select('*, brands(name), country_codes(name, flag, iso)')`). The joins are
 * optional so a plain DBTable row stays assignable — used by the PO cascade
 * popover and the inline "add variant" form.
 */
export type BrandVariantWithJoins = BrandVariant & {
  brands?: { name: string } | null
  country_codes?: { name: string; flag: string | null; iso: string } | null
}
export type InventoryItemInsert = DBInsert<'inventory_items'>
export type InventoryItemUpdate = DBUpdate<'inventory_items'>
// Explicit insert shape (subset of DBInsert) to keep the API surface minimal.
export type BrandVariantInsert = {
  item_id: string
  brand?: string
  brand_id?: string | null
  country_id?: number | null
  code?: string | null
  cost_price?: number | null
  selling_price?: number | null
  average_cost?: number | null
  reorder_point?: number
  stock_level?: number | null
}
export type BrandVariantUpdate = Partial<Omit<BrandVariantInsert, 'item_id'>> & { id?: string }

export function useInventoryCategories() {
  return useQuery({
    queryKey: queryKeys.inventory.categories,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_categories')
        .select('*')
        .order('name_en')
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

export function useInventoryItems(categoryType?: string) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsByType(categoryType),
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('inventory_items')
        .select('id, category_id, name_en, name_ar, sku, unit, cost_price, po_specification_default, sort_order, status, total_stock, linked_services_count, inventory_categories!inner(type, name_en)')
        .eq('status', 'active')
        .order('name_en')

      if (categoryType) {
        query = query.eq('inventory_categories.type', categoryType as 'products' | 'spare-parts' | 'consumables' | 'tools')
      }

      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useBrandVariants(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsByItem(itemId),
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('*, brands(name), country_codes(name, flag, iso)')
        .eq('item_id', itemId!)
        .eq('status', 'active')
        .order('sort_order')
        .limit(500)
      if (error) throw error
      return data
    },
    enabled: !!itemId,
  })
}

export function useCreateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: InventoryItemInsert & { is_team_item?: boolean | null }) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .insert(values as unknown as InventoryItemInsert)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Item Created',
        module: 'inventory',
        entity_id: data.id,
        entity_type: 'item',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
    },
  })
}

export function useUpdateInventoryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: InventoryItemUpdate & { id: string; is_team_item?: boolean | null }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('inventory_items')
        .update(values as unknown as InventoryItemUpdate)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Item Updated',
        module: 'inventory',
        entity_id: id,
        entity_type: 'item',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
    },
  })
}

/**
 * Effective team-item context for the item editor: the category's default flag
 * (always) plus the item's own override (edit only). Read via select('*') + cast
 * because is_team_item is newer than the generated types (migration
 * 20260918000000). Effective value = itemFlag ?? categoryFlag.
 */
export function useItemTeamItemContext(categoryId: string | null, itemId: string | null) {
  return useQuery({
    queryKey: ['inventory', 'team-item-context', categoryId, itemId],
    queryFn: async () => {
      const supabase = createClient()
      const [cat, itm] = await Promise.all([
        categoryId
          ? supabase.from('inventory_categories').select('*').eq('id', categoryId).maybeSingle()
          : Promise.resolve({ data: null }),
        itemId
          ? supabase.from('inventory_items').select('*').eq('id', itemId).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      const categoryFlag = ((cat.data as unknown as { is_team_item?: boolean } | null)?.is_team_item) ?? false
      const itemFlag = itemId
        ? ((itm.data as unknown as { is_team_item?: boolean | null } | null)?.is_team_item ?? null)
        : null
      return { categoryFlag, itemFlag }
    },
    enabled: !!categoryId,
    staleTime: 60 * 1000,
  })
}

/** Atomic tool creation: item + default brand_variant via RPC.
 *  Used by the Master Data → Tools & Assets Add Tool button. */
export function useCreateToolItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: { name_en: string; name_ar?: string | null; category_id: string }) => {
      const supabase = createClient()
      const { data, error } = await supabase.rpc('create_tool_item_with_default_variant', {
        p_name_en:     payload.name_en,
        p_name_ar:     payload.name_ar ?? '',
        p_category_id: payload.category_id,
      })
      if (error) throw error
      const newItemId = data as unknown as string
      void logActivity({
        action:      'Tool Created',
        module:      'inventory',
        entity_id:   newItemId,
        entity_type: 'inventory_item',
        new_data:    { name_en: payload.name_en, category_id: payload.category_id },
      })
      return newItemId
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
    },
  })
}

export function useCreateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (values: BrandVariantInsert) => {
      const supabase = createClient()
      // brand is NOT NULL in the DB; the brand_id sync trigger fills it from
      // brands.name when brand_id is set, but leaves it untouched otherwise —
      // default to '' so origin-only/generic variants (brand_id null) still insert.
      const insertValues = { ...values, brand: values.brand ?? '' }
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .insert(insertValues as unknown as DBInsert<'inventory_item_brand_variants'>)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Brand Variant Created',
        module: 'inventory',
        entity_id: data.id,
        entity_type: 'brand_variant',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      // Bare-key (prefix) invalidation — matches useUpdateBrandVariant /
      // useArchiveInventoryBrandVariant. The item-scoped key variant used to
      // invalidate here (`brandVariantsV2ByItem(variables.item_id)` →
      // ['brand-variants-v2', itemId, undefined]) fails TanStack's
      // partialMatchKey against the tree's actual query key
      // (['brand-variants-v2', itemId, false]) because slot 2 is `undefined`
      // vs `false` — a type mismatch, not just a value mismatch. Invalidating
      // the bare key instead refetches every variant list for every item.
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.allBrandNames })
    },
  })
}

export function useUpdateBrandVariant() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: BrandVariantUpdate & { id: string }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_item_brand_variants')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .update(values as unknown as import('@/types/database.types').DBUpdate<'inventory_item_brand_variants'>)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Brand Variant Updated',
        module: 'inventory',
        entity_id: id,
        entity_type: 'brand_variant',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariants })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
      queryClient.invalidateQueries({ queryKey: queryKeys.inventory.items })
    },
  })
}

export function useInventoryItemsAll(enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsAll,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*, inventory_categories(id, name_en, type)')
        .order('name_en')
      if (error) throw error
      return (data ?? []) as (InventoryItem & {
        inventory_categories: { id: string; name_en: string; type: string } | null
      })[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export interface BrandVariantGrouped {
  variantId: string
  brand: string
  costPrice: number
  itemId: string
  itemName: string
  itemSku: string
  catId: string
  catName: string
  catType: string
  imageUrl: string | null
  countryName: string | null
}

/** All brand variants with item + category info — used for the hierarchical link picker. */
export function useAllBrandVariantsGrouped(enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsGrouped,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, brand, cost_price, country_codes(name), inventory_items(id, name_en, sku, image_url, inventory_categories(id, name_en, type))')
        .order('brand')
      if (error) throw error
      const rows = (data ?? []) as Array<{
        id: string
        brand: string
        cost_price: number | null
        country_codes: { name: string | null } | null
        inventory_items: {
          id: string
          name_en: string
          sku: string
          image_url: string | null
          inventory_categories: { id: string; name_en: string; type: string } | null
        } | null
      }>
      return rows.map((r): BrandVariantGrouped => ({
        variantId: r.id,
        brand: r.brand,
        costPrice: r.cost_price ?? 0,
        itemId: r.inventory_items?.id ?? '',
        itemName: r.inventory_items?.name_en ?? 'Unknown item',
        itemSku: r.inventory_items?.sku ?? '',
        catId: r.inventory_items?.inventory_categories?.id ?? '__none__',
        catName: r.inventory_items?.inventory_categories?.name_en ?? 'Uncategorised',
        catType: r.inventory_items?.inventory_categories?.type ?? '',
        imageUrl: r.inventory_items?.image_url ?? null,
        countryName: r.country_codes?.name ?? null,
      }))
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── New types ────────────────────────────────────────────────────────────────

export type FifoLayer = {
  id: string
  brand_variant_id: string
  receival_number: string | null
  receival_id: string | null
  source_type: string | null
  source_id: string | null
  date: string
  qty: number
  remaining_qty: number
  unit_cost: number
  landed_cost_per_unit: number
  total_unit_cost: number
  created_at: string
  warehouse_id: string | null
  warehouse_name: string | null
  sub_container_id: string | null
  sub_container_name: string | null
}

export type ToolAssetUnit = {
  id: string
  item_id: string
  serial_number: string | null
  brand: string | null
  status: string
  assigned_to: string | null
  division_id: string | null
  condition: string
  expiry: string | null
  created_at: string
  is_placeholder: boolean
  receival_item_id: string | null
}

// ─── Category hooks (new) ─────────────────────────────────────────────────────

export function useInventoryCategoriesByType(type: string, showArchived = false) {
  return useQuery({
    queryKey: queryKeys.inventory.categoriesByType(type, showArchived),
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_categories')
        .select('*')
        .eq('type', type as 'products' | 'spare-parts' | 'consumables' | 'tools')
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as InventoryCategory[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateInventoryCategory() {
  const qc = useQueryClient()
  return useMutation<InventoryCategory, Error, { name_en: string; name_ar?: string | null; sku?: string | null; type: string; parent_id?: string | null; default_sub_container_id?: string | null; default_warranty_policy_id?: string | null; tool_tracking_mode?: 'serialized' | 'bulk'; is_team_item?: boolean }>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_categories')
        .insert(payload as unknown as DBInsert<'inventory_categories'>)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Category Created',
        module: 'inventory',
        entity_id: data.id,
        entity_type: 'category',
        new_data: data as unknown as Record<string, unknown>,
      })
      return data as InventoryCategory
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesByType(v.type) })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesTree })
    },
  })
}

export function useUpdateInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: string; name_en?: string; name_ar?: string | null; sku?: string | null; status?: string; parent_id?: string | null; default_sub_container_id?: string | null; default_warranty_policy_id?: string | null; tool_tracking_mode?: 'serialized' | 'bulk'; is_team_item?: boolean }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_categories')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      const { data, error } = await supabase
        .from('inventory_categories')
        .update(payload as unknown as DBUpdate<'inventory_categories'>)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action: 'Category Updated',
        module: 'inventory',
        entity_id: id,
        entity_type: 'category',
        old_data: old as unknown as Record<string, unknown> | null,
        new_data: data as unknown as Record<string, unknown>,
      })
      return data as InventoryCategory
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesTree })
    },
  })
}

// ─── Item hooks (new) ─────────────────────────────────────────────────────────

export function useInventoryItemsByCategory(categoryId: string | null, showArchived = false) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsByCategoryId(categoryId, showArchived),
    enabled: !!categoryId,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_items')
        .select('*')
        .eq('category_id', categoryId!)
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
        .limit(1000)
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as InventoryItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

/**
 * Descendant-rollup variant: fetch every item whose `category_id` is in the
 * passed set. Used by the cascade so picking a parent category (e.g. "AC")
 * surfaces items across all descendant leaves (3 Ton, 4 Ton, …) — the
 * attribute filter bar then narrows across the merged set.
 */
export function useInventoryItemsByCategories(categoryIds: string[], showArchived = false) {
  const sortedKey = [...categoryIds].sort().join(',')
  return useQuery({
    queryKey: ['inventory', 'items-by-categories', sortedKey, showArchived],
    enabled: categoryIds.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_items')
        .select('*')
        .in('category_id', categoryIds)
        .order('sort_order', { ascending: true })
        .order('name_en', { ascending: true })
        .limit(2000)
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as InventoryItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useArchiveInventoryItem() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_items').select('*').eq('id', id).maybeSingle()
      const { error } = await supabase
        .from('inventory_items')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
      const name = (old as { name?: string } | null)?.name ?? null
      void logActivity({
        action: 'Item Archived',
        module: 'inventory',
        entity_id: id,
        entity_type: 'item',
        severity: 'warning',
        old_data: { name, status: 'active' },
        new_data: { name, status: 'archived' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

// ─── Brand variant hooks (new) ────────────────────────────────────────────────

export function useInventoryBrandVariants(itemId: string | null, showArchived = false) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsV2ByItem(itemId, showArchived),
    enabled: !!itemId,
    queryFn: async () => {
      const supabase = createClient()
      let q = supabase
        .from('inventory_item_brand_variants')
        .select('*, brands(name), country_codes(name, flag, iso)')
        .eq('item_id', itemId!)
        .order('sort_order', { ascending: true })
        .order('brand', { ascending: true })
        .limit(500)
      if (!showArchived) q = q.neq('status', 'archived')
      const { data, error } = await q
      if (error) throw error
      return data as BrandVariant[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useArchiveInventoryBrandVariant() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('inventory_item_brand_variants').select('*').eq('id', id).maybeSingle()
      const { error } = await supabase
        .from('inventory_item_brand_variants')
        .update({ status: 'archived' })
        .eq('id', id)
      if (error) throw error
      const brand = (old as { brand?: string } | null)?.brand ?? null
      void logActivity({
        action: 'Brand Variant Archived',
        module: 'inventory',
        entity_id: id,
        entity_type: 'brand_variant',
        severity: 'warning',
        old_data: { name: brand, status: 'active' },
        new_data: { name: brand, status: 'archived' },
      })
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 }),
  })
}

// ─── FIFO layers ──────────────────────────────────────────────────────────────

export function useFifoLayers(brandVariantId: string | null, enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.fifoLayersByVariant(brandVariantId),
    enabled: enabled && !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('id, brand_variant_id, receival_number, receival_id, source_type, source_id, date, qty, remaining_qty, unit_cost, landed_cost_per_unit, total_unit_cost, created_at, warehouse_id, warehouses!fifo_cost_layers_warehouse_id_fkey(name), sub_container_id, warehouse_sub_containers:sub_container_id(name)')
        .eq('brand_variant_id', brandVariantId!)
        .order('date', { ascending: true })
        .order('receival_number', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []).map((r) => {
        const row = r as unknown as {
          id: string
          brand_variant_id: string
          receival_number: string | null
          receival_id: string | null
          source_type: string | null
          source_id: string | null
          date: string
          qty: number
          remaining_qty: number
          unit_cost: number
          landed_cost_per_unit: number
          total_unit_cost: number
          created_at: string
          warehouse_id: string | null
          warehouses: { name: string } | null
          sub_container_id: string | null
          warehouse_sub_containers: { name: string } | null
        }
        return {
          id: row.id,
          brand_variant_id: row.brand_variant_id,
          receival_number: row.receival_number,
          receival_id: row.receival_id,
          source_type: row.source_type,
          source_id: row.source_id,
          date: row.date,
          qty: row.qty,
          remaining_qty: row.remaining_qty,
          unit_cost: row.unit_cost,
          landed_cost_per_unit: row.landed_cost_per_unit,
          total_unit_cost: row.total_unit_cost,
          created_at: row.created_at,
          warehouse_id: row.warehouse_id,
          warehouse_name: row.warehouses?.name ?? null,
          sub_container_id: row.sub_container_id,
          sub_container_name: row.warehouse_sub_containers?.name ?? null,
        }
      }) as FifoLayer[]
    },
    staleTime: 2 * 60 * 1000,
  })
}

// ─── Per-warehouse stock breakdown ────────────────────────────────────────────

export type WarehouseStockRow = { warehouse_id: string; qty: number }
export type VariantWarehouseStock = { perWarehouse: WarehouseStockRow[]; unassigned: number; hasReceivals: boolean }

export function useVariantWarehouseStock(variantId: string | undefined, enabled = true) {
  return useQuery<VariantWarehouseStock>({
    queryKey: queryKeys.inventory.variantWarehouseStockById(variantId),
    queryFn: async () => {
      if (!variantId) return { perWarehouse: [], unassigned: 0, hasReceivals: false }
      const supabase = createClient()
      const { data, error } = await supabase
        .from('fifo_cost_layers')
        .select('warehouse_id, remaining_qty, receival_id')
        .eq('brand_variant_id', variantId)
        .gt('remaining_qty', 0)
        .limit(1000)
      if (error) throw error

      const whMap = new Map<string, number>()
      let unassigned = 0
      let hasReceivals = false
      for (const row of (data ?? []) as { warehouse_id: string | null; remaining_qty: number; receival_id: string | null }[]) {
        if (row.receival_id) hasReceivals = true
        if (!row.warehouse_id) {
          unassigned += row.remaining_qty
        } else {
          whMap.set(row.warehouse_id, (whMap.get(row.warehouse_id) ?? 0) + row.remaining_qty)
        }
      }

      return {
        perWarehouse: Array.from(whMap.entries()).map(([warehouse_id, qty]) => ({ warehouse_id, qty })),
        unassigned,
        hasReceivals,
      }
    },
    enabled: !!variantId && enabled,
    // Was staleTime: 0 → refetched on every tooltip-open (hover noise + quota).
    // 30s de-dupes rapid re-hovers; receival mutations still invalidate the
    // `variantWarehouseStock` key (useInventoryReceivals.ts) so a receival's
    // stock change shows immediately regardless of staleness.
    staleTime: 30_000,
  })
}

// ─── Category stock aggregates ────────────────────────────────────────────────

export type CategoryStockAggregate = {
  category_id: string
  total_stock: number
  total_reserved: number
  total_damaged: number
  total_incoming: number
  avg_cost: number
  variant_count: number
}

export function useCategoryStockAggregates(categoryType: string, divisionIds: string[] = []) {
  // Empty set ("All divisions") → global aggregates (p_division_ids NULL, the
  // exact pre-existing behaviour). One or more divisions → the RPC rolls good
  // stock up from warehouse_stock_summary via sub_container -> division.
  const divKey = [...divisionIds].sort().join(',')
  return useQuery({
    queryKey: [...queryKeys.inventory.categoryStockAggregates(categoryType), divKey],
    queryFn: async () => {
      const supabase = createClient()
      // `p_division_ids` isn't in the (stale) generated types yet — cast like the
      // report RPCs do so the defaulted param can be passed.
      const { data, error } = await supabase.rpc('get_category_stock_aggregates' as never, {
        p_type: categoryType,
        p_division_ids: divisionIds.length ? divisionIds : null,
      } as never)
      if (error) throw error
      const map = new Map<string, CategoryStockAggregate>()
      for (const row of ((data ?? []) as unknown as CategoryStockAggregate[])) {
        map.set(row.category_id, row)
      }
      return map
    },
    staleTime: 60 * 1000,
  })
}

// ─── Tool asset hooks ─────────────────────────────────────────────────────────
// Unit-tracking only. The item catalog lives in inventory_items — see
// useInventoryItems / useInventoryItemsByCategory.

export function useToolAssetUnits(itemId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventory.toolAssetUnits(itemId),
    enabled: !!itemId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .select('*')
        .eq('item_id', itemId!)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return (data ?? []) as ToolAssetUnit[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useCreateToolAssetUnit() {
  const qc = useQueryClient()
  return useMutation<ToolAssetUnit, Error, { item_id: string; serial_number: string; brand: string; condition?: string; expiry?: string | null; status?: string; assigned_to?: string | null; division_id?: string | null }>({
    mutationFn: async (payload) => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .insert({ condition: 'Good', status: 'available', ...payload } as unknown as DBInsert<'tool_asset_units'>)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action:      'Tool Unit Created',
        module:      'inventory',
        entity_id:   data.id,
        entity_type: 'tool_unit',
        new_data:    data as unknown as Record<string, unknown>,
      })
      return data as ToolAssetUnit
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.toolAssetUnits(v.item_id) })
    },
  })
}

export function useUpdateToolAssetUnit() {
  const qc = useQueryClient()
  return useMutation<ToolAssetUnit, Error, { id: string; item_id: string; serial_number?: string | null; brand?: string; condition?: string; status?: string; expiry?: string | null; assigned_to?: string | null; is_placeholder?: boolean; division_id?: string | null }>({
    mutationFn: async ({ id, item_id: _item_id, ...payload }) => {
      const supabase = createClient()
      const { data: old } = await supabase
        .from('tool_asset_units').select('*').eq('id', id).maybeSingle()
      const { data, error } = await supabase
        .from('tool_asset_units')
        .update(payload as unknown as import('@/types/database.types').DBUpdate<'tool_asset_units'>)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      void logActivity({
        action:      'Tool Unit Updated',
        module:      'inventory',
        entity_id:   id,
        entity_type: 'tool_unit',
        old_data:    old as unknown as Record<string, unknown> | null,
        new_data:    data as unknown as Record<string, unknown>,
      })
      return data as ToolAssetUnit
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.toolAssetUnits(v.item_id) })
    },
  })
}

/** Confirm a placeholder serialized unit's serial via the perm-gated
 *  `rpc_confirm_tool_serial` DEFINER RPC instead of a direct table UPDATE.
 *  After tool_asset_units writes were locked to inventory.catalog.manage
 *  (migration 20260828000000), receivers (purchase.receivals.create) can still
 *  serialize units because the RPC gates on manage OR receivals.create and,
 *  being DEFINER, bypasses the tightened RLS. */
export function useConfirmToolSerial() {
  const qc = useQueryClient()
  return useMutation<void, Error, { unit_id: string; item_id: string; serial: string; brand: string; expiry?: string | null }>({
    mutationFn: async ({ unit_id, serial, brand, expiry }) => {
      const supabase = createClient()
      // Types not yet regenerated for this RPC — cast to bypass the strict rpc-name union.
      const { error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        'rpc_confirm_tool_serial',
        { p_unit_id: unit_id, p_serial: serial, p_brand: brand, p_expiry: expiry ?? null }
      )
      if (error) throw error as Error
      void logActivity({
        action:      'Tool Unit Serial Confirmed',
        module:      'inventory',
        entity_id:   unit_id,
        entity_type: 'tool_unit',
        new_data:    { serial_number: serial, brand } as unknown as Record<string, unknown>,
      })
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.toolAssetUnits(v.item_id) })
    },
  })
}

export type PlaceholderUnitForReceival = ToolAssetUnit & {
  item_name: string
  item_sku: string | null
}

/** Returns placeholder tool_asset_units that were auto-created by triggers for the given receival.
 *  Joined with the item catalog so the caller can group by item and show a friendly name. */
export function usePlaceholderUnitsByReceival(receivalId: string | null) {
  return useQuery({
    queryKey: ['tool-asset-units-placeholder-by-receival', receivalId] as const,
    enabled: !!receivalId,
    queryFn: async () => {
      const supabase = createClient()
      // First: resolve receival_item ids for this receival
      const { data: ri, error: riErr } = await supabase
        .from('receival_items')
        .select('id')
        .eq('receival_id', receivalId!)
      if (riErr) throw riErr
      const receivalItemIds = (ri ?? []).map((r) => r.id)
      if (receivalItemIds.length === 0) return [] as PlaceholderUnitForReceival[]

      const { data, error } = await supabase
        .from('tool_asset_units')
        .select('*, inventory_items:item_id(id, name_en, sku)')
        .in('receival_item_id', receivalItemIds)
        .is('serial_number', null)
        .order('created_at', { ascending: true })
        .limit(500)
      if (error) throw error
      return ((data ?? []) as unknown as (ToolAssetUnit & { inventory_items: { id: string; name_en: string; sku: string | null } | null })[])
        .map((u) => ({
          ...u,
          item_name: u.inventory_items?.name_en ?? '(Unknown item)',
          item_sku: u.inventory_items?.sku ?? null,
        })) as PlaceholderUnitForReceival[]
    },
    staleTime: 0,
  })
}

export function useAutoGenerateToolSerials() {
  const qc = useQueryClient()
  return useMutation<{ updated_count: number; sku_prefix: string }, Error, { item_id: string }>({
    mutationFn: async ({ item_id }) => {
      const supabase = createClient()
      // Types not yet regenerated for this RPC — cast to bypass strict rpc-name union
      const { data, error } = await (supabase.rpc as unknown as (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>)(
        'auto_generate_tool_serials',
        { p_item_id: item_id }
      )
      if (error) throw error as Error
      const result = (data ?? {}) as { updated_count?: number; sku_prefix?: string }
      return { updated_count: result.updated_count ?? 0, sku_prefix: result.sku_prefix ?? '' }
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.toolAssetUnits(v.item_id) })
    },
  })
}

/** Unit-level transfer (Task 2b.3): moves tool_asset_units.division_id (the
 *  OWNING division) via the perm-gated `rpc_transfer_tool_unit`. Deliberately
 *  does NOT touch assigned_to — division owns, person holds. */
export function useTransferToolUnit() {
  const qc = useQueryClient()
  return useMutation<
    void,
    Error,
    { unit_id: string; item_id: string; from_division_id: string | null; to_division_id: string; notes?: string | null }
  >({
    mutationFn: async ({ unit_id, to_division_id, notes }) => {
      const supabase = createClient()
      // RPC isn't in the generated types yet — cast the name + args.
      const { error } = await supabase.rpc(
        'rpc_transfer_tool_unit' as never,
        { p_unit_id: unit_id, p_to_division_id: to_division_id, p_notes: notes ?? null } as never,
      )
      if (error) throw error
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.toolAssetUnits(v.item_id) })
      void logActivity({
        action:      'Tool Unit Transferred',
        module:      'inventory',
        entity_id:   v.unit_id,
        entity_type: 'tool_unit',
        details:     v.notes || null,
        old_data:    { division_id: v.from_division_id },
        new_data:    { division_id: v.to_division_id },
      })
    },
  })
}

// ─── All items flat (for Service Links tab) ───────────────────────────────────

export function useInventoryItemsFlat(enabled = true) {
  return useQuery({
    queryKey: queryKeys.inventory.itemsAllV2,
    enabled,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_items')
        .select('id, name_en, name_ar, sku, category_id, unit, linked_services_count')
        .neq('status', 'archived')
        .order('name_en', { ascending: true })
      if (error) throw error
      return (data ?? []) as InventoryItem[]
    },
    staleTime: 5 * 60 * 1000,
  })
}

// ─── Cascade archive category ─────────────────────────────────────────────────

export function useArchiveInventoryCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (categoryId: string) => {
      const supabase = createClient()
      const { data: cat } = await supabase
        .from('inventory_categories').select('name_en').eq('id', categoryId).maybeSingle()
      const { error } = await supabase.rpc('rpc_archive_inventory_category', { p_category_id: categoryId })
      if (error) throw error
      const catName = (cat as { name_en?: string } | null)?.name_en ?? null
      void logActivity({
        action: 'Category Archived',
        module: 'inventory',
        entity_id: categoryId,
        entity_type: 'category',
        severity: 'warning',
        old_data: { name: catName, status: 'active' },
        new_data: { name: catName, status: 'archived' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.categoriesTree })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

// ─── Sort order bulk update ───────────────────────────────────────────────────

export function useUpdateSortOrders(table: 'inventory_categories' | 'inventory_items' | 'inventory_item_brand_variants') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      const supabase = createClient()
      const p_updates = updates.map((u) => ({ table_name: table, id: u.id, sort_order: u.sort_order }))
      const { error } = await supabase.rpc('rpc_update_inventory_sort_orders', { p_updates })
      if (error) throw error
    },
    onSuccess: () => {
      if (table === 'inventory_categories') qc.invalidateQueries({ queryKey: queryKeys.inventory.categories })
      if (table === 'inventory_items') qc.invalidateQueries({ queryKey: queryKeys.inventory.itemsByCategory })
      if (table === 'inventory_item_brand_variants') qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsV2 })
    },
  })
}

// ─── Staff profiles (for tool unit assignment) ────────────────────────────────

export function useStaffProfiles() {
  return useQuery({
    queryKey: queryKeys.inventory.staffProfiles,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_data')
        .select('id, full_name')
        .order('full_name')
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string }[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

// ─── LC Price Review helpers ───────────────────────────────────────────────────

export type BrandVariantPriceSummary = {
  id: string
  selling_price: number | null
  average_cost: number | null
}

export function useBrandVariantsByIds(ids: string[]) {
  return useQuery({
    queryKey: queryKeys.inventory.brandVariantsPriceSummaryByIds(ids.slice().sort().join(',')),
    enabled: ids.length > 0,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('id, selling_price, average_cost')
        .in('id', ids)
      if (error) throw error
      return (data ?? []) as BrandVariantPriceSummary[]
    },
    staleTime: 0,
  })
}

export type SellingPriceUpdate = {
  id: string
  selling_price: number
}

export function useBatchUpdateSellingPrices() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (updates: SellingPriceUpdate[]) => {
      const supabase = createClient()
      // Single Postgres transaction via RPC — avoids N parallel HTTP requests
      const { error } = await supabase
        .rpc('batch_update_variant_prices', { p_updates: updates })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariants })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.inventoryBrandVariants })
      qc.invalidateQueries({ queryKey: queryKeys.inventory.brandVariantsPriceSummary })
    },
  })
}

// ─── Reserved order lines (for the reserved-badge drill-down) ────────────────

export type ReservedOrderLine = {
  id: string
  qty: number
  delivered_qty: number
  sale_orders: {
    id: string
    so_number: string
    status: string
    expected_delivery: string | null
    customers: { name: string } | null
  } | null
}

export function useReservedOrderLines(brandVariantId: string | null) {
  return useQuery({
    queryKey: queryKeys.inventory.reservedOrderLinesByVariant(brandVariantId),
    enabled: !!brandVariantId,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('sale_order_lines')
        .select('id, qty, delivered_qty, sale_orders!inner(id, so_number, status, expected_delivery, customers(name))')
        .eq('brand_variant_id', brandVariantId!)
        .in('sale_orders.status', ['confirmed', 'partial_delivery'])
        .is('sale_orders.deleted_at', null)
      if (error) throw error
      return (data ?? []) as ReservedOrderLine[]
    },
    staleTime: 30 * 1000,
  })
}

export function useAllBrandNames() {
  return useQuery({
    queryKey: queryKeys.inventory.allBrandNames,
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('inventory_item_brand_variants')
        .select('brand')
        .neq('status', 'archived')
        .order('brand')
      if (error) throw error
      return [...new Set((data ?? []).map((r: { brand: string }) => r.brand))] as string[]
    },
    staleTime: 10 * 60 * 1000,
  })
}

